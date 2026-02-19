#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/stacks/networking-stack';
import { AgentFleetStack } from '../lib/stacks/agent-fleet-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

const networking = new NetworkingStack(app, 'OpenClawNetworking', { env });

new AgentFleetStack(app, 'OpenClawAgentFleet', {
  env,
  vpc: networking.vpc,
  securityGroup: networking.securityGroup,
});
