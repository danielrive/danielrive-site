---
slug: EKS-Prometheus
title: Adding monitoring to EKS using Prometheus operator
authors: [danielrivera]
tags: [aws,SmartCash-Project,kubernetes]
---

![eks+prometheus+grafana](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/404iotfmmlhlrsm8swt7.png)

Previous articles showed how to [build the EKS Infrastructure in AWS](https://dev.to/aws-builders/smartcash-project-infrastructure-terraform-and-github-actions-2bo3) and [how to install FluxCD](https://dev.to/aws-builders/smartcash-project-gitops-with-fluxcd-3aep) to implement GitOps practices, This article is focused on explaining the steps taken to install the Prometheus Operator(using Helm) and Grafana for monitoring.

<!-- truncate -->

## Source Code

The source code for this project can be found [here](https://github.com/danielrive/smart-cash/releases/tag/v1.3.0), also a [GitOps repository](https://github.com/danielrive/smart-cash-gitops-flux) has been created to store the Yaml files that FluxCD uses and apply to the EKS cluster.

## Prometheus operator

> The Prometheus Operator provides Kubernetes native deployment and management of Prometheus and related monitoring components.

The [Prometheus operator](https://prometheus-operator.dev/docs/operator/design/) defines Kubernetes Custom Resources and controllers that facilitate installing Prometheus. The community has developed alternative options such as _kube-Prometheus_ and _kube-prometheus-stack_ to install the components to monitor Kubernetes.

### Prometheus Operator, kube-prometheus and kube-prometheus-stack

The project repository for Prometheus-operator can be found [here](https://github.com/prometheus-operator/prometheus-operator), The repo defines the CRDs and the controller. You can follow this [documentation](https://prometheus-operator.dev/docs/user-guides/getting-started/) for the installation. which will require the creation of metrics exporters, node exporters, scrape configurations, etc.

On the other hand, the [Kube-prometheus](https://github.com/prometheus-operator/kube-prometheus) project provides documentation and scripts to operate end-to-end Kubernetes cluster monitoring using the Prometheus Operator, making easier the process of monitoring the Kubernetes cluster.

[kube-prometheus-stack](https://github.com/prometheus-community/helm-charts) is a Helm chart that contains several components to monitor the Kubernetes cluster, along with Grafana dashboards to visualize the data. This option will be used in this article.

## Installing kube-prometheus-stack Helm chart

In previous articles, FluxCD was installed in EKS cluster to implement GitOps, the following flux source will now be added.

``` YAML
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: HelmRepository
metadata:
  name: helm-repo-prometheus
  namespace: flux-system
spec:
  interval: 10m0s
  url: https://prometheus-community.github.io/helm-charts
```

Also, a Flux Helm release is added

``` YAML
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: prometheus
  namespace: monitoring
spec:
  interval: 10m0s
  chart:
    spec:
      chart: kube-prometheus-stack
      sourceRef:
        kind: HelmRepository
        name: helm-repo-prometheus
        namespace: flux-system
  values:
    defaultRules:
      rules:
        etcd: false
        kubeSchedulerAlerting: false
        kubeSchedulerRecording: false
        windows: false
    prometheus:
      prometheusSpec:
        storageSpec:
            volumeClaimTemplate:
              spec:
                storageClassName: aws-ebs-gp2
                accessModes: ["ReadWriteOnce"]
                resources:
                  requests:
                    storage: 40Gi
```

If you examine the values for the chart, by default, it installs rules to monitor etcd and some other control plane components. However, in this case, that is not necessary due to EKS limiting access to certain control-plane components.

By default, Prometheus uses local storage to store data. To enable persistent storage, an EBS volume can be added. In this scenario, the [EBS CSI](https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html) driver is employed, and a storage class is defined to manage the integration with Prometheus.

Once the manifests are ready, you can push them to the GitOps repo( [here](https://github.com/danielrive/smart-cash-gitops-flux/blob/main/common/helm-prometheus.yaml) for this case), and wait for Flux to handle the installation process in the cluster.

You can check the cluster by looking for the resources created, notice that for this case, everything will be placed in the **monitoring** namespace.

`kubectl get crd`

![prometheus-cdr](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qfjv7qgaitj5a0pmmsfc.png)

Additionally, certain deployments and services should have been created in the monitoring namespace.

`kubectl get pods -n monitoring`

![pods](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/6suj0e8ez0kf3jkn3vde.png)

Let's look at the Prometheus server console, you can expose the service by an ingress or using port-forward.

`kubectl port-forward service/prometheus-kube-prometheus-prometheus 3001:9090 -n monitoring`

The previous command will expose the Prometheus service in localhost:3001, you can go directly to the targets and you should see some targets created automatically, as well as the metrics and the services discovered by the server.

![targets](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/z0a5ff0d9w9es56q4gtu.png)

This is useful because you don't need to configure the targets to monitor K8 and node metrics, the Helm chart does this for you. For instance, a simple example is just to check the number of pods created in the default namespace, you can run this PromQL query.

`count(kube_pod_created{namespace="default"})`

![simple-query](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/dwt7ryjpjyay53x2q9r7.png)

### Grafana Dashboards

Helm chart also installs Grafana and configures some useful dashboards that you can use, if you list the services and pods you will see some resources related to Grafana. You can expose the Grafana service or create an ingress for it.

#### Creating nginx ingress for Grafana

Nginx-ingress is utilized and installed using Helm. You can add the following Flux source and the Helm release to the GitOps repo. Check the GitOps repo for this project [here](https://github.com/danielrive/smart-cash-gitops-flux/blob/main/common/helm-nginx-ingress.yaml) and use it as a model.

Helm source

```yaml
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: HelmRepository
metadata:
  name: helm-repo-nginx-ingress
  namespace: flux-system
spec:
  interval: 10m0s
  type: oci
  url: oci://ghcr.io/nginxinc/charts
```

Use this yaml to install the chart, in this case AWS Network Load Balancer is used, this is done through the annotation specified in the values for the chart.

``` Yaml
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: nginx-ingress
  namespace: nginx-ingress
spec:
  interval: 10m0s
  chart:
    spec:
      chart: nginx-ingress
      version: 1.0.2
      sourceRef:
        kind: HelmRepository
        name: helm-repo-nginx-ingress
        namespace: flux-system
  values:
    controller:
      service:
        annotations: 
          service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
```

#### Installing Cert-managet to support SSL

> This article will not dig into details about cert-manager concepts.

In order to support SSL in the EKS cluster cert-manager will be used, cert-manager adds certificates and certificate issuers as resource types in Kubernetes clusters, and simplifies the process of obtaining, renewing and using those certificates.

Cert-manager uses Kubernetes CRD, to install them you can run:

`kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.2/cert-manager.crds.yaml`

This also can be added to the GitOps repo(check [here](https://github.com/danielrive/smart-cash-gitops-flux/blob/main/common/crd-cert-manager.yaml)) and given to Flux to handle it.

When the CRDs are ready, you can install cert-manager, in this case a Helm chart will be used, this also will be added in GitOps repo.

```YAML
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: cert-manager
  namespace: cert-manager
spec:
  interval: 10m0s
  chart:
    spec:
      chart: cert-manager
      version: 1.13.2
      sourceRef:
        kind: HelmRepository
        name: helm-cert-manager
        namespace: flux-system
  values:
    serviceAccount:
      annotations:
        eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/cert-manager-us-west-2
    securityContext:
      fsGroup: 1001
    extraArgs:
      - --issuer-ambient-credentials

```

Finally and cert-manager ClusterIssuer is added, in this case the domain will be validated in AWS Route53, this is done through the IAM role passed in the previous YAML file for the Helm chart.

```YAML
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: example-letsencrypt2
spec:
  acme:
    email: notreply@example.info
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: example-issuer-account-key
    solvers:
    - selector:
        dnsZones:
          - "example.info"
      dns01:
        route53:
          region: us-west-2
```

Once cert-manager and nginx-ingress are installed you can create an ingress for Grafana. The following manifest has been added to the GitOps repo.

``` YAML
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana-ingress
  namespace: monitoring
  annotations:
    cert-manager.io/cluster-issuer: example-letsencrypt2
spec:
  ingressClassName: nginx
  rules:
  - host: monitoring.example.info
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: prometheus-grafana
            port:
              number: 80
  tls:
   - hosts:
     - monitoring.example.info
     secretName: example-issuer-account-ingress-key2
```

With this installed you can browser and access Grafana, you should see some dashboards already created.

![Grafana-dash](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/cxhfnhv82jfuk3b1kj8t.png)

For instance, the _Kubernetes/API server_ dashboard is pre-configured, also you can also use third-party dashboards.

![Grafana-k8-api](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/7zilyb7s756tkm696r4g.png)
