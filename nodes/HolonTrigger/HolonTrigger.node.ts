import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

/** Compares two strings in constant time, so the token cannot be guessed a character at a time. */
function sameSecret(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** Same slug as the Holon gateway uses for a listing's name. */
const slug = (s: string) =>
	String(s ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64);

/**
 * Starts a workflow when Holon calls it: the workflow becomes an agent that AI agents find on
 * Holon and pay per successful run. Only calls carrying your token get in. When the workflow is
 * activated, the trigger registers that token with Holon for the agent <your handle>/<agent name>.
 * The input arrives as the item's JSON; what the last node returns (or a Respond to Webhook node)
 * is the agent's output. To report a failure that is not billed, answer
 * {"error": {"code": "...", "message": "..."}}.
 */
export class HolonTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Holon Trigger',
		name: 'holonTrigger',
		icon: { light: 'file:../../icons/holon.svg', dark: 'file:../../icons/holon.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{"Agent: " + $parameter["agentName"]}}',
		description: 'Turn this workflow into a paid agent: starts when an AI agent calls it through Holon',
		defaults: { name: 'Holon Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'holonTriggerApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: '={{$parameter["responseMode"]}}',
				responseData: 'firstEntryJson',
				path: 'holon',
			},
		],
		properties: [
			{
				displayName:
					'Activate the workflow, then in the Holon console (Your agents, Connect a webhook) paste the Production URL above with the same agent name and one example input. Holon writes the listing from its answer.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Agent Name',
				name: 'agentName',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'Company enrich',
				description: 'The name of the agent on Holon. Its ID is your handle followed by this name in lowercase with dashes.',
			},
			{
				displayName: 'Respond',
				name: 'responseMode',
				type: 'options',
				default: 'lastNode',
				options: [
					{
						name: 'When Last Node Finishes',
						value: 'lastNode',
						description: "The last node's first item is the agent's output",
					},
					{
						name: "Using 'Respond to Webhook' Node",
						value: 'responseNode',
						description: 'Answer from a Respond to Webhook node, e.g. to return an error code',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			// Holon keeps no list of n8n webhooks to compare with: registering again is harmless, so
			// every activation registers the token.
			async checkExists(this: IHookFunctions): Promise<boolean> {
				return false;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const credentials = await this.getCredentials('holonTriggerApi');
				const baseUrl = String(credentials.baseUrl || 'https://api.useholon.com').replace(/\/$/, '');
				const name = slug(this.getNodeParameter('agentName') as string);
				const request = (method: 'GET' | 'PUT', path: string, body?: IDataObject) =>
					this.helpers.httpRequestWithAuthentication.call(this, 'holonTriggerApi', {
						method,
						url: `${baseUrl}${path}`,
						json: true,
						returnFullResponse: true,
						ignoreHttpStatusErrors: true,
						...(body && { body }),
					}) as Promise<{ statusCode: number; body: IDataObject }>;
				const me = await request('GET', '/v0/me');
				if (me.statusCode !== 200 || typeof me.body.handle !== 'string') {
					throw new NodeApiError(this.getNode(), me.body as never, { message: `Holon: ${me.body.error ?? 'cannot read your account'}` });
				}
				const saved = await request('PUT', `/v0/agents/${me.body.handle}/${name}/credential`, { token: credentials.token as string });
				if (saved.statusCode !== 200) {
					throw new NodeApiError(this.getNode(), saved.body as never, { message: `Holon: ${saved.body.error ?? saved.statusCode}` });
				}
				this.getWorkflowStaticData('node').agent = `${me.body.handle}/${name}`;
				return true;
			},
			// Deactivating the workflow leaves the listing and its token: the author yanks a version
			// in the Holon console when they want to stop listing it.
			async delete(this: IHookFunctions): Promise<boolean> {
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const credentials = await this.getCredentials('holonTriggerApi');
		const header = String(this.getHeaderData().authorization ?? '');
		const given = header.replace(/^Bearer\s+/i, '');
		const expected = String(credentials.token ?? '');
		if (!expected || !given || !sameSecret(given, expected)) {
			const res = this.getResponseObject();
			res.status(401).json({ error: { code: 'unauthorized', message: 'only Holon calls this agent' } });
			return { noWebhookResponse: true };
		}
		return { workflowData: [this.helpers.returnJsonArray((this.getBodyData() ?? {}) as IDataObject)] };
	}
}
