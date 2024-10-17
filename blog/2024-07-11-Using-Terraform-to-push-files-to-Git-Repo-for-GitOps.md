---
slug: terraform-gitops
title: Using Terraform to push files to Git Repo for GitOps
authors: [danielrivera]
tags: [aws,SmartCash-Project,kubernetes]
---

In this article, I will share my thoughts about using Terraform in the GitOps process, specifically to create the manifest and push it to the Git repo.

![simple image](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/chouc9wyoln2u16pvejf.png)

<!-- truncate -->

## The basics

GitOps relies on a Git repository as the single source of truth. New commits imply infrastructure and application updates.

Imagine a Git repository where you push all the manifests of the Kubernetes resources you want to create in your cluster. These are pulled by a tool or script that runs a "kubectl apply", creates the resources, and checks the Git repo for new changes to apply. This, at a high level, is GitOps.

## Setting up the scenario

For this case, the K8 cluster will run in AWS EKS, and Terraform is being used as an IaC tool.

A basic cluster can be created using Terraform. You can check an example [here](https://github.com/danielrive/smart-cash/blob/main/infra/terraform/modules/eks/main.tf).

FluxCD installation can be done using [the official documentation](https://fluxcd.io/flux/installation/bootstrap/github/) or you can check [this](https://dev.to/aws-builders/smartcash-project-gitops-with-fluxcd-3aep).

I will not explain some Flux concepts like sources and Kustomizations; you can check that in the links shared previously.

## Creating the YAML files

Let's say that we want to create a namespace for the development environment, we can use the following YAML:

```YAML
apiVersion: v1
kind: Namespace
metadata:
  name: develop
  labels:
    test: true
```

We can push this file to GitHub and wait for FluxCD to do the magic.

Now let's say that we want to create a service account and associate it with an AWS IAM role, the YAML can be:

```YAML
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sa-test-develop
  annotations:  
    eks.amazonaws.com/role-arn: arn:aws:iam::12345678910:role/TEST
```

This looks easy but what happens if we have multiple environments or if We don't yet know the ARN of the role because this is part of our IaC?

![help-me](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/1l8cmmw835be29z1fak2.png)

Here is where Terraform gives us a hand.

You can create something like a template for the manifest and some variables that you can specify with Terraform. The two manifests would look like:

```YAML
apiVersion: v1
kind: Namespace
metadata:
  name: ENVIRONMENT
  labels:
    test: true
```

```YAML
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sa-test-ENVIRONMENT
  annotations:  
    eks.amazonaws.com/role-arn: ROLE_ARN
```

Notice the ENVIRONMENT and ROLE_ARN variables added.

We can use the [Terraform GitHub provider](https://registry.terraform.io/providers/integrations/github/latest/docs) to push the file to the repository. Let's check the following code to push the service account:

``` terraform
resource "github_repository_file" "sa-test" {
  repository          = data.github_repository.flux-gitops.name
  branch              = main
  file                = "./manifest/sa-manifest.yaml"
  content = templatefile(
    "sa-manifest.yaml",
    {
      ENVIRONMENT = var.environment
      ROLE_ARN = aws_iam_role.arn
    }
  )
  commit_message      = "Terraform"
  commit_author       = "terraform"
  commit_email        = "example@example"
  overwrite_on_create = true
}
```

The arguments **repository** and **branch** allow us to specify the remote repo and the branch where we want to push the file. The **file** argument is the location **in the remote repository** where we want to put the file.

The **content** argument is where we pass the values to the variables created in the template, in this case ENVIRONMENT and ROLE_ARN, the values are a terraform variable and the reference to a Terraform resource that creates the role.

**overwrite_on_create** argument is needed because if you run Terraform again, it will show an error because the file already exists in the repo.

## Pros

1. Pushing the manifests using Terraform avoids the manual tasks of committing and pushing them, allowing us to automate more steps.
2. We can integrate this process into our pipeline, so a full environment can be ready when the pipeline finishes.
3. Terraform count can be used when there are many manifests to push, avoiding repetitive code.
