---
slug: Event-Bridge-Lambda
title: AWS Event-Bridge and Lambda to copy RDS snapshots to another Region
authors: [danielrivera]
tags: [aws]
---

![Architecture Diagram](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/6rjyhs8hmbwc76fkztos.png)

A few months ago I was asked to design the DRP process(Multi-Region) for a project that used RDS(PostgreSQL). RDS instances were critical components, these stored PII information. RDS automatically takes snapshots of the instances and you can use them to recreate the instances in case of failure, these snapshots just can be used in the same region but you can share or copy them between accounts and Regions, here some [AWS Docs related RDS automatic snapshots](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html).

<!-- truncate -->

My initial idea was to create a K8 job to run pg_dump for each RDS instance and then, upload the file to an S3 bucket created in a different region, not too bad but this requires more work to backup and restore. so I decided to copy snapshots between regions, a new challenge appeared here, how to automate that copy? In this post I will show the approach that I follow to solve this, one crucial point to mention here is that for a big number of snapshots, this solution could not be the best due to some limitations that AWS RDS to copy snapshots.

AWS Documentation says:
>
"You can have up to 20 snapshot copy requests in progress to a single destination Region per account."

This approach uses AWS event-bridge and Lambda to automate the copy process, at summary, even-bridge detects that a new RDS snapshot has been created and triggers a lambda function to copy the snapshot to the other region.

>
A terraform code was created for this pods and you can check it [here](https://github.com/danielrive/blog-posts/blob/main/copy-rds-snapshots)

## RDS Snapshot

You can configure automated RDS snapshots for your instance, this occurs daily during the backup window that you define in the instance creation.
In this case, the automated RDS snapshot was configured in each instance, this just creates the snapshot in the same account and region where the RDS instance was created.

## AWS Event-Bridge

EventBridge is a serverless service that uses events to connect application components together, making it easier for you to build scalable event-driven applications. You can use it to route events from sources such as home-grown applications, AWS services, and third-party software to consumer applications across your organization.

In this case, AWS generates a significant number of events for some services, for RDS you can find the events divided into categories, the following table shows the events for RDS snapshots. when RDS starts an automated snapshot, AWS registers that event. You can find all the events in the [AWS documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_Events.Messages.html).

![RDS Events](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/beogf5s4wdgk7wfbb5c3.png)

### How to use the events?

Let's start with an important concept in the EventBridge world, An event bus. This a pipeline that receives events, you can configure rules to manipulate the events and specify actions when these came. Events are represented as JSON objects and they all have a similar structure and the same top-level fields. By default, the AWS accounts have a default event bus that receives events from AWS services.

![default event-bus](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/g2qv8j574deuvsbwz4rb.png)

In this case, we can create a rule using the default event-bus.

![rds-rule-creation](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/mmi4m21fibnoe4anq2k5.png)

You can choose the AWS service to use and AWS will show you and JSON with an example of how the event will look.

For our case we can use a simpler event using the EventID for automated snapshots, RDS-EVENT-0091, you can refer to the image shown at the top of the post for more information.

``` json
{
  "source": ["aws.rds"],
  "detail-type": ["RDS DB Snapshot Event"],
  "account": ["1234567890"],
  "region": ["us-east-1"],
  "detail": {
     "SourceType": ["SNAPSHOT"],
      "EventID": ["RDS-EVENT-0091"]   
    }
}
```

With the event-pattern defined, we can specify the lambda function to execute when this event comes to the default event bus.

![Trigger-lambda](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/0l40u9o0ai1k7xehswu8.png)

This means that if an event is received in the default event bus and matches with the pattern specified, that will trigger the lambda and pass a JSON with the event generated, this looks like this:

``` json
{
  "version": "0",
  "id": "844e2571-85d4-695f-b930-0153b71dcb42",
  "detail-type": "RDS DB Snapshot Event",
  "source": "aws.rds",
  "account": "123456789012",
  "time": "2018-10-06T12:26:13Z",
  "region": "us-east-1",
  "resources": ["arn:aws:rds:us-east-1:123456789012:db:mysql-instance-2018-10-06-12-24"],
  "detail": {
    "EventCategories": ["creation"],
    "SourceType": "SNAPSHOT",
    "SourceArn": "arn:aws:rds:us-east-1:123456789012:db:mysql-instance-2018-10-06-12-24",
    "Date": "2018-10-06T12:26:13.882Z",
    "SourceIdentifier": "rds:mysql-instance-2018-10-06-12-24",
    "Message": "Automated snapshot created"
  }
}
```

## Lambda Function

The lambda function is a python code that gets the events and extracts the useful information and starts a copy in another region.

The lambda functions just start the copy, the function doesn't wait to be completed the task.

You can see the python code [here](https://github.com/danielrive/blog-posts/blob/main/copy-rds-snapshots/modules/python_code/copy-snapshots.py)
