type ApprovalAction = 'APPROVE' | 'REJECT';

export interface ApprovalSlackNotificationInput {
  decisionId: string;
  eventId: string;
  repository: string;
  branch: string;
  failureType: string;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH';
  compositeScore: number;
  reasoning: string;
  recommendedAction: string;
  approver: string;
  action: ApprovalAction;
  justification: string;
}

function buildApprovalText(input: ApprovalSlackNotificationInput, reviewUrl: string): string {
  const actionLabel = input.action === 'APPROVE' ? 'approved' : 'rejected';

  return [
    `Approval ${actionLabel} for ${input.repository}`,
    `${input.branch} • ${input.failureType} • ${Math.round(input.compositeScore * 100)} score`,
    `Risk tier: ${input.riskTier}`,
    `Approver: ${input.approver}`,
    `Recommended action: ${input.recommendedAction}`,
    `Reason: ${input.justification}`,
    `Review: ${reviewUrl}`,
  ].join('\n');
}

export async function sendApprovalSlackNotification(
  input: ApprovalSlackNotificationInput,
): Promise<boolean> {
  const webhookUrl = process.env.SLACK_APPROVALS_WEBHOOK_URL;

  if (!webhookUrl) {
    return false;
  }

  let reviewUrl = input.eventId;

  try {
    reviewUrl = new URL(
      `/events/${input.eventId}`,
      process.env.ADMIN_PANEL_URL ?? 'http://localhost:3000',
    ).toString();
  } catch {
    reviewUrl = input.eventId;
  }

  const text = buildApprovalText(input, reviewUrl);
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `Approval ${input.action === 'APPROVE' ? 'approved' : 'rejected'}: ${input.repository}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Repository*\n${input.repository}` },
            { type: 'mrkdwn', text: `*Branch*\n${input.branch}` },
            { type: 'mrkdwn', text: `*Risk*\n${input.riskTier}` },
            { type: 'mrkdwn', text: `*Score*\n${Math.round(input.compositeScore * 100)}` },
            { type: 'mrkdwn', text: `*Approver*\n${input.approver}` },
            { type: 'mrkdwn', text: `*Action*\n${input.action}` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Reasoning*\n${input.reasoning}\n\n*Justification*\n${input.justification}\n\n*Review*\n${reviewUrl}`,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed with status ${response.status}`);
  }

  return true;
}