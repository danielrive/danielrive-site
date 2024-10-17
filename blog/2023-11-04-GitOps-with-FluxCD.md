---
slug: fluxcd
title: GitOps with FluxCD
authors: [danielrivera]
tags: [aws,SmartCash-Project,kubernetes]
---

![GitOps meme, source https://blog.kubesimplify.com/gitops-demystified](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/t18cxoi3v9353gucvs2p.png)

In a [previous article](https://dev.to/aws-builders/smartcash-project-infrastructure-terraform-and-github-actions-2bo3) I mentioned the idea behind this project that I named SmartCash. I began building the terraform code for the infrastructure in AWS and the pipeline to deploy it.

<!-- truncate -->

In this article, I will introduce FluxCD as a GitOps tool and demonstrate its usage.

## Source code

A new release has been created in the smart-cash repository for the project. v1.1.0 version will be used, you can check the repository [here](https://github.com/danielrive/smart-cash/tree/v1.1.0).

Additionally, a new repository will be created to store the K8 manifest that will be synced with the EKS cluster using FluxCD, you can view the repo [here](https://github.com/danielrive/smart-cash-gitops-flux).

## A quick introduction to GitOps

GitOps is an operational model for cloud-native architectures,  it relies on a Git repository as the single source of truth. New commits imply infrastructure and application updates.

OpenGitOps group has defined 5 principles, and while I won't delve into them, [here](https://opengitops.dev/), you can read more. If you take a look at those principles you will see that they are, in some sense related to some Kubernetes concepts.

A great book to gain a better understanding of GitOps history and concepts is **[The Path to GitOps](https://developers.redhat.com/e-books/path-gitops)**.

In summary, GitOps is centered around using a Git repository for defining and managing both infrastructure and application configurations through a Git-based workflow.

### What is FluxCD

[FluxCD](https://fluxcd.io/) is an open-source GitOps operator for Kubernetes, you can declaratively define the desired state of your infrastructure and configurations in a Git repository. Flux monitors the repository and applies updates to the Kubernetes cluster when new changes arrive.

Flux started as a monolith but in v2 it was broken up into individual components called GitOps Toolkit, this refers collection of specialized tools, Flux Controllers, composable APIs, and reusable Go packages available under the fluxcd GitHub organization.

Core concepts and toolkit components are described [here](https://www.weave.works/technologies/what-is-flux-cd/).

![hands-on](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/hv4kfhyq6yq90x3e27wh.png)

## Installing FluxCD in the cluster

FluxCD [installation](https://fluxcd.io/flux/installation/) can be done by Flux CLI, the most straightforward method can be done by the [**_flux bootstrap_** command](https://fluxcd.io/flux/installation/bootstrap/), this deploys the Flux controllers on the K8 cluster and configures them to synchronize the cluster to the Git repository, if the Git Repo doesn't exist, the bootstrap command will create it.

To incorporate FluxCD installation into this project a new bash script has been added into the repository that contains the terraform code, this bash script will be execute by terraform as a null resource.

``` bash
#/bin/bash

## Configure Cluster Credentials

# $1 = CLUSTER_NAME
# $2 = AWS_REGION
# $3 = GH_USER_NAME
# $4 = FLUX_REPO_NAME

echo "---------->  get eks credentials"
aws eks update-kubeconfig --name $1  --region $2

## validate if flux is installed

flux_installed=$(kubectl api-resources | grep flux)
if [ -z "$flux_installed" ]; then
  echo "---------->  flux is not installed"

  ### install flux

  echo "---------->  installing flux cli"

  curl -s https://fluxcd.io/install.sh | sudo bash

  echo "---------->  run flux bootstrap"
  flux bootstrap github \
    --owner=$3 \
    --repository=$4 \
    --path="clusters/$1/bootstrap" \
    --branch=main \
    --personal
else
  echo "---------->  flux is installed"
fi
```

The _flux bootstrap github_ command deploys the Flux controllers on the K8 cluster and configures the controllers to synchronize the Git repo with the cluster. This is done by some K8 manifests that are created and pushed to the repo in the path passed in the command.

It's worth noting that some env variables like FLUX_REPO_NAME, and GH_USER_NAME are used by the bash script, these variables are passed as an argument in the bash script execution.

### Adding FluxCD bootstrap script to terraform code

The bash script will be executed in the GH workflow template created to deploy the infrastructure, the following job is added to the Workflow template.

```terraform
#### bash script arguments
  # $1 = CLUSTER_NAME
  # $2 = AWS_REGION
  # $3 = GH_USER_NAME
  # $4 = FLUX_REPO_NAME

resource "null_resource" "bootstrap-flux" {
  depends_on          = [module.eks_cluster]
  provisioner "local-exec" {
    command = <<EOF
    ./scripts/bootstrap-flux.sh ${local.cluster_name}  ${var.region} ${local.gh_username} ${data.github_repository.flux-gitops.name}
    EOF
  }
  triggers = {
    cluster_oidc = module.eks_cluster.cluster_oidc
    created_at   = module.eks_cluster.created_at
  }

}
```

Notice that the _GITHUB_TOKEN_ variable is passed directly in the Github job.

Once the workflow is ready you can push it to the repo and see how terraform will create all the infra and after EKS cluster creation will execute the bash script.

You can run **flux check** command locally to validate the status of the installation(you should have access to the cluster in your local env)

![flux-check](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/czt08fmy5h10p2gq0na3.png)

If you take a look at the above image you will see that the Source Controller is deployed, [Source Controller](https://fluxcd.io/flux/components/source/) enables seamless integration of various Git repositories with your Kubernetes cluster. Think of the Source Controller as an interface to connect with GitRepositories, OCIRepository, HelmRepository, and Bucket resources.

`✔ source-controller: deployment ready`

The bootstrap command will create a flux source and associate it to the repo passed in the command, to validate this you can list the git sources created and you will see the one, for now.

```bash
flux get sources git
```

![Flux-git-source](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/kjtan9rnhp0qc9mb6l02.png)

and you can see the K8 CDRs created

`kubectl get crds | grep flux`

## Structuring the Git repository

There are different strategies to structure the GitOps repository, for this scenario, a mono-repo strategy is used and [kustomize](https://kustomize.io/) will be used to manage the K8 manifest for the application.

- **./clusters**: contains all the cluster associated with the project, cluster for each environment or region should be placed here.

- **./clusters/smart-cash-develop/bootstrap:** Yaml files created by fluxcd installation, also there is a file name **core-kustomization.yaml** that points to a core folder that manages the manifests.

- **./clusters/smart-cash-develop/core:** Contains the main manifest for the project, manifest like FluxSources, and also kustomization files. Here will be placed the kustomization file for each microservice that will be created.

- **./clusters/smart-cash-develop/core:** Manifests that create common resources for the cluster like namespaces, ingress, storage-classes, etc.

- **Manifests:** This contains subfolders that contain the YAML files for each microservices.

``` txt
├── clusters
    └── smart-cash-develop
        |── bootstrap
        |── common
        |   |── ingress-namespace.yaml
        |   └── namespaces.yaml
        |── core
        |   |── common-kustomize.yaml
        |   └── helm-cert-manager.yaml
        └── manifests
            └── app1
                |── base
                |   |── kustomization.yaml
                |   └── deployment.yaml
                └── overlays
                    |── develop
                    |   └── kustomization.yaml
                    └── production
                        └── kustomization.yaml 
```

## Adding resources to the cluster

Let's create a K8 namespace to be used for an nginx-ingress. The manifest for this can be placed in the _common_ folder. A FluxCD Kustomization can be added to synchronize the contents of this folder with the K8 cluster.

The following is the Flux Kustomization that reconciles the Kubernetes manifests located at the path _./common_ in the Git repository .

**Note:** This file can be added in _clusters/smart-cash-develop_ folder, FluxCD will automatically create the Kustomization resource because this path was specified in the bootstrap command, and Flux created a Kustomization to synchronize it.

```YAML
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: smartcash-common
  namespace: flux-system
spec:
  interval: 5m
  targetNamespace: default
  sourceRef:
    kind: GitRepository
    name: flux-system
  path: "./kustomize"
  prune: true
```

- **interval:** The period at which the Kustomization is reconciled.
- **sourceRef:** refers to the Source object with the required Artifacts, in this case, our GitOps repository.
- **prune:**: When is true, if previously applied objects are missing from the current revision, these objects are deleted from the cluster

Once you push the Yaml file to the GitOps repo, Flux will create the resources in the cluster. You can validate running:

`kubectl get kustomization -n flux-system`

![common-kustomization](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/s0aqez3paizw42s38imz.png)

The previous steps have created the FluxCD Kustomization to sync the _common_ folder with the cluster. Now, a Kustomize file needs to be added to specify which resource to create.

Don't confuse the [FluxCD Kustomization](https://fluxcd.io/flux/components/kustomize/kustomizations/#path) file with the K8 configuration management [Kustomize](https://kustomize.io/). FluxCD will look for the Kustomize file in the _common_ folder.

Let's create and push the following files in the _common_ folder.

``` YAML
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
- ns-nginx-ingress.yaml
```

```YAML
apiVersion: v1
kind: Namespace
metadata:
  name: nginx-ingress
```

You can wait for the flux reconciliation or force it using the following command:

```bash
flux reconcile kustomization smartcash-common
```

If the process was successful you should see the nginx-ingress namespace.

### Troubleshooting

To validate the status of the reconciliation you can use the following command:

``` bash
flux get kustomization smartcash-common
```

For instance, a mistake in the name of the YAML files caused this error, which was visible in the output of the flux command.

![Flux-error](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/2gdw0r19wyk1r285c7hz.png)

If you want more details you can check the K8 CDRs using:

```bash
kubectl describe kustomization smartcash-common -n flux-system 
```

## Creating a Helm release for nginx-ingress

The Flux Helm Controller will be used to install the ingress. [The Helm Controller](https://fluxcd.io/flux/components/helm/) is a Kubernetes operator that enables the management of Helm chart releases.

A FluxCD source for Helm needs to be added. This can be accomplished by using the following manifest, which should be placed in _clusters/smart-cash-develop_.

``` YAML
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: HelmRepository
metadata:
  name: helm-repo-nginx-ingress
  namespace: flux-system
spec:
  interval: 5m0s
  type: oci
  url: oci://ghcr.io/nginxinc/charts
```

This source fetches the Helm OCI repository oci://ghcr.io/nginxinc/charts every 5 minutes, and the artifact is stored and updated each time new updates are done to the repository.

After creating the Helm source, you can proceed to create the Helm release. This release specifies the chart to install in the cluster, with the chart being fetched from the source already created. The following manifest can be used.

```yaml
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
      version: 0.17.1
      sourceRef:
        kind: HelmRepository
        name: helm-repo-nginx-ingress
        namespace: flux-system

```

To delegate the creation of the HelmRelease task to flux, this file can be added to the common folder and in the Kustomize file as well.

``` YAML
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
- ns-nginx-ingress.yaml
- nginx-ingress-helm.yaml
```

After updating and pushing the files, you can validate the creation of the Helm Release and nginx-ingress resources.

``` YAML
flux get helmreleases -n nginx-ingress
```

![Helm-releases](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ui87g1erg9j42rc1ost4.png)

Up to this point, we've covered the second phase of this project. In the upcoming articles, you'll delve into the implementation of various other tools and continue building the project.

If you have any feedback or suggestions, please feel free to reach out to me on [LinkedIn](https://www.linkedin.com/in/danielrive/).
