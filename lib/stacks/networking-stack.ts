import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class NetworkingStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'AgentVpc', {
      vpcName: 'openclaw-squad-vpc',
      maxAzs: 2,
      natGateways: 0,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    this.securityGroup = new ec2.SecurityGroup(this, 'AgentSg', {
      vpc: this.vpc,
      securityGroupName: 'openclaw-squad-sg',
      description: 'Security group for OpenClaw agent fleet',
      allowAllOutbound: true,
    });

    // Self-referencing rule: agents can talk to each other + Tailscale router
    this.securityGroup.addIngressRule(
      this.securityGroup,
      ec2.Port.allTraffic(),
      'Allow inter-agent communication',
    );

    // ── Tailscale Subnet Router ────────────────────────────────
    const tsRole = new iam.Role(this, 'TailscaleRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    tsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          cdk.Arn.format(
            { service: 'ssm', resource: 'parameter', resourceName: 'openclaw/tailscale-auth-key' },
            this,
          ),
        ],
      }),
    );

    const tsUserData = ec2.UserData.forLinux();
    tsUserData.addCommands(
      'set -euo pipefail',
      'exec > /var/log/tailscale-bootstrap.log 2>&1',
      'export HOME=/root',
      '',
      'echo "=== Installing Tailscale ==="',
      'dnf install -y jq',
      'curl -fsSL https://tailscale.com/install.sh | sh',
      '',
      '# Enable IP forwarding for subnet routing',
      "echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.d/99-tailscale.conf",
      "echo 'net.ipv6.conf.all.forwarding = 1' >> /etc/sysctl.d/99-tailscale.conf",
      'sysctl -p /etc/sysctl.d/99-tailscale.conf',
      '',
      '# Fetch auth key from SSM',
      `TS_AUTH_KEY=$(aws ssm get-parameter --name /openclaw/tailscale-auth-key --with-decryption --query 'Parameter.Value' --output text --region ${this.region})`,
      '',
      '# Start Tailscale as subnet router for the VPC CIDR',
      'systemctl enable tailscaled',
      'systemctl start tailscaled',
      'tailscale up --authkey="${TS_AUTH_KEY}" --advertise-routes=10.0.0.0/16 --accept-routes --hostname=openclaw-router',
      '',
      'echo "=== Tailscale subnet router bootstrap complete ==="',
    );

    const tsInstance = new ec2.Instance(this, 'TailscaleRouter', {
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: this.securityGroup,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      role: tsRole,
      userData: tsUserData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
      associatePublicIpAddress: true,
      sourceDestCheck: false, // Required for subnet routing
    });

    cdk.Tags.of(tsInstance).add('Project', 'openclaw-squad');
    cdk.Tags.of(tsInstance).add('Name', 'openclaw-tailscale-router');

    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
    new cdk.CfnOutput(this, 'SecurityGroupId', {
      value: this.securityGroup.securityGroupId,
    });
    new cdk.CfnOutput(this, 'TailscaleRouterId', {
      value: tsInstance.instanceId,
    });
  }
}
