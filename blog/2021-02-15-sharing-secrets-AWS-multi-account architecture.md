---
slug: aws-secret-manager
title: Sharing secrets to ECS in an AWS multi-account architecture
authors: [danielrivera]
tags: [aws]
---
![Alt Text](https://dev-to-uploads.s3.amazonaws.com/i/hc1ewvgl19l0b0yeqser.png)

In this post, We'll see the highlight steps on how to share secrets between AWS account using  ECS Fargate that get the secrets stored in AWS Secret manager but in a different account. We'll use Terraform to build this.

<!-- truncate -->

When We are developing our application the best practice to pass secret inside our code is to use environment variables, Secret Manager is a great option to store our variables, We can rotate them and has direct integration with some AWS services like RDS and Redshift.

On another side AWS Multi-account architecture can be a good election if We want to separate some resources and maintain isolated environments, AWS provides us different ways to achieve that, being AWS control tower a good way to create and government multi-account architectures. The following image shows an AWS multi-account architecture with three accounts, Production, Develop, and Security, the last one can be used to store our environment variables, and there We can define strong policies to limit the access to the resources.

Previous image shows the architecture that We'll use, you can find the terraform code in this [Link](https://github.com/danielrive/aws-ecs-iac). A Secret Manager will be created in the Security account, this secret is encrypted using a custom KMS Key, We can't use the default KMS key because that is managed by AWS, and We can not control it and modify its policy. ECS task will use an IAM role with the correct permissions to get secrets from the Security account and put them into the container.

## Terraform Code

The Terraform code is using Modules stored in the same repo, and use AWS profiles(.aws/credentials) to get the credentials to create resources, in this case, We have two profiles, the first one for a Develop Account and the second one for a Security account. To specify the profiles you must set the names in two terraform variables.

``` terraform
provider "aws" {
  profile = var.PROFILE_NAME1 # profile name for dev account
  region  = var.REGION
}

provider "aws" {
  profile = var.PROFILE_NAME2
  region  = var.REGION
  alias   = "Security_Account"
}
```

## Steps

**1. Create IAM Roles - Develop Account**
The first resource that We need to create is the IAM Role that the containers will use, this role must have permissions to get secrets and use the KMS to decrypt the secret. This role must be created in the account in which you'll create the ECS resources. Go to [GitHub](https://github.com/danielrive/aws-ecs-iac) repo to see in detail the Modules.

``` terraform
## Module to create an IAM ROLE for ECS Task
module "ECS_ROLE" {
  source          = "./Modules/IAM"
  CREATE_ECS_ROLE = true
  NAME            = "ECS-Role-TASK"
}
```

**2. Create KMS key - - Security Account**
Once you have the ECS role and its ARN you can create the KMS key, this key must be created in the security account and the policy should allow to ECS role created in Step 1 to describe and decrypt the key.

``` terraform
# KMS POLICY for the Key
data "aws_iam_policy_document" "KMS_POLICY" {
  statement {
    sid    = "AllowUseOfTheKey"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = [module.ECS_ROLE.ARN_ROLE]
    }
    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
    ]
    resources = ["*"]
  }
}
```

How this resource must be created in the Security account We need to specify the provider when We call the Terraform Module.

```terraform
### Module to create a KMS Key

module "KMS_SECRET_MANAGER" {
  source = "./Modules/KMS"
  NAME   = "KMS-key-SecretManager"
  providers = {
    aws = aws.Security_Account   # alias for security account defined in the first lines of this code
  }
  POLICY = data.aws_iam_policy_document.KMS_POLICY.json
}
```

**3. Create Secret Manager - Security Account**
With the KMS Key ready We can continue with the Secret Manager creation, for this case, We'll attach to the secret manager a resource-based policy to allow access to ECS role created in the Develop account.

```terraform
### Resource based policy for Secret Manager
data "aws_iam_policy_document" "SECRET_MANAGER_POLICY" {
  statement {
    sid    = "AllowUseSecrerManager"
    effect = "Allow"
    actions = [
      "secretsmanager:*"
    ]
    principals {
      type        = "AWS"
      identifiers = [module.ECS_ROLE.ARN_ROLE]
    }
    resources = ["*"]
  }
}
```

```terraform
## Module to create a Secret Manager with a resource based policy
module "SECRET_MANAGER" {
  source    = "./Modules/SecretManager"
  NAME      = "SECRET_MANAGER_TEST1"
  RETENTION = 10
  KMS_KEY   = module.KMS_SECRET_MANAGER.ARN_KMS
  POLICY    = data.aws_iam_policy_document.SECRET_MANAGER_POLICY.json
}
```

**4. Create ECS resources and ALB - Develop Account**
The last step is to create the ECS resources and the ALB.

```terraform
### Module to create a Task Definition
module "ECS_TASK_DEFINITION" {
  depends_on     = [module.SECRET_MANAGER]
  source         = "./Modules/ECS/TaskDefinition"
  NAME           = "test"
  ARN_ROLE       = module.ECS_ROLE.ARN_ROLE
  CPU            = 512
  MEMORY         = "1024"
  DOCKER_REPO    = "alpine"
  REGION         = "us-west-2"
  SECRET_ARN     = module.SECRET_MANAGER.SECRET_ARN
  CONTAINER_PORT = 80
}
### Module to create a Target Group
module "TARGET_GROUP" {
  source              = "./Modules/ALB"
  CREATE_TARGET_GROUP = true
  NAME                = "testing"
  PORT                = 80
  PROTOCOL            = "HTTP"
  VPC                 = "vpc-0dfa4368a6f7bf90d"
  TG_TYPE             = "ip"
  HEALTH_CHECK_PATH   = "/"
  HEALTH_CHECK_PORT   = 80
}
```

The Task Definition is responsible to define the secret manager to use. If We go through terraform code for Task Definition We can see that in the container definition section We specify the secret manager ARN.

``` terraform
"secrets": [
            {
             "name" : "VARIABLE_TESTING",
             "valueFrom" :  ${var.SECRET_ARN}
            }
          ]
```

We need to keep in mind that ECS will get the full secrets stored in the secret manager(key/value) into the variable that you specify, in this case, *VARIABLE_TESTING*(feel free to change the name), which means that the *VARIABLE_TESTING* will contain the full secrets in plaintext.

for instance, suppose We have three secrets in Secret Manager
![Alt Text](https://dev-to-uploads.s3.amazonaws.com/i/3qsw767bqbpfap56k93y.png)

in plaintext

``` terraform
{
  "endpoint": "www.testingecs.com",
  "pass": "1234567",
  "token": "34asda3asdas4q34"
}
```

According to the above mentioned the variable *VARIABLE_TESTING* will contain the plaintext representation and if We run `echo $VARIABLE_TESTING` inside the container We will get the plaintext representation.

To extract the secrets from *VARIABLE_TESTING* We can implement a bash script and run it as Entrypoint.

With the steps showed above We can get secrets stored in another AWS account, which helps us to limit the access and create a special policy for the security account with the permissions necessary for users and AWS services.

### References

* [AWS documentation 1](https://aws.amazon.com/es/premiumsupport/knowledge-center/secrets-manager-share-between-accounts/)

* [AWS documentation 2](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html)
