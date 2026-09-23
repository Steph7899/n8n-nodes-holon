import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

type HolonResponse = { statusCode: number; body: IDataObject };

/**
 * Calls agents listed on Holon (useholon.com): search them, call one by id or by capability, and
 * see the budget left. Every call spends from the mandate of the agent key, is billed only when it
 * succeeds, and never above its worst case. Usable as a tool by the AI Agent node.
 */
export class Holon implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Holon',
		name: 'holon',
		icon: { light: 'file:../../icons/holon.svg', dark: 'file:../../icons/holon.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Call AI agents from the Holon registry, paid only when they succeed, within your budget',
		defaults: { name: 'Holon' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'holonApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'call',
				options: [
					{
						name: 'Call an Agent',
						value: 'call',
						action: 'Call an agent',
						description: 'Run an agent on an input. Billed only if it succeeds.',
					},
					{
						name: 'Search Agents',
						value: 'search',
						action: 'Search agents',
						description: 'Find agents for a task, ranked by cost per successful run',
					},
					{
						name: 'Get Budget',
						value: 'budget',
						action: 'Get the budget',
						description: 'What your mandate allows and how much of it is left',
					},
				],
			},
			// --- call ---
			{
				displayName: 'Choose By',
				name: 'target',
				type: 'options',
				default: 'agent',
				displayOptions: { show: { operation: ['call'] } },
				options: [
					{ name: 'Agent', value: 'agent', description: 'A specific agent, e.g. holon-labs/pdf-tables' },
					{
						name: 'Capability',
						value: 'capability',
						description: 'A task class, e.g. extraction.table: Holon picks the best agent your mandate allows',
					},
				],
			},
			{
				displayName: 'Agent',
				name: 'agent',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'holon-labs/csv-profile',
				description: 'Agent ID, optionally with a version (holon-labs/csv-profile@1)',
				displayOptions: { show: { operation: ['call'], target: ['agent'] } },
			},
			{
				displayName: 'Capability',
				name: 'capability',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'extraction.table',
				displayOptions: { show: { operation: ['call'], target: ['capability'] } },
			},
			{
				displayName: 'Input',
				name: 'input',
				type: 'json',
				default: '{}',
				required: true,
				description: "The agent's input, as its page on useholon.com describes it",
				displayOptions: { show: { operation: ['call'] } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['call'] } },
				options: [
					{
						displayName: 'Max Cost',
						name: 'maxCost',
						type: 'string',
						default: '',
						placeholder: '0.05',
						description: 'Never pay more than this for one call, in the currency of your mandate',
					},
				],
			},
			// --- search ---
			{
				displayName: 'Task',
				name: 'query',
				type: 'string',
				default: '',
				placeholder: 'extract tables from a PDF',
				description: 'Words describing what you need',
				displayOptions: { show: { operation: ['search'] } },
			},
			{
				displayName: 'Capability',
				name: 'searchCapability',
				type: 'string',
				default: '',
				placeholder: 'extraction.table',
				description: 'Only agents of this capability class (optional)',
				displayOptions: { show: { operation: ['search'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('holonApi');
		const baseUrl = String(credentials.baseUrl || 'https://api.useholon.com').replace(/\/$/, '');

		const request = async (method: IHttpRequestMethods, path: string, options: { body?: IDataObject; qs?: IDataObject; headers?: IDataObject } = {}) => {
			const res = (await this.helpers.httpRequestWithAuthentication.call(this, 'holonApi', {
				method,
				url: `${baseUrl}${path}`,
				json: true,
				returnFullResponse: true,
				ignoreHttpStatusErrors: true,
				...options,
			})) as HolonResponse;
			return res;
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'call') {
					const target = this.getNodeParameter('target', i) as string;
					const raw = this.getNodeParameter('input', i);
					let input: IDataObject;
					try {
						input = (typeof raw === 'string' ? JSON.parse(raw || '{}') : raw) as IDataObject;
					} catch {
						throw new NodeOperationError(this.getNode(), 'Input is not valid JSON', { itemIndex: i });
					}
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const body: IDataObject = { input };
					if (target === 'agent') body.agent = this.getNodeParameter('agent', i) as string;
					else body.capability = this.getNodeParameter('capability', i) as string;
					if (options.maxCost) body.max_cost = String(options.maxCost);

					// The same execution and item never pay twice: a retried call returns its receipt.
					const idempotencyKey = `n8n-${this.getExecutionId()}-${this.getNode().id}-${i}`;
					const res = await request('POST', '/v0/calls', { body, headers: { 'Idempotency-Key': idempotencyKey } });
					const receipt = (res.body.receipt ?? {}) as IDataObject;
					if (res.statusCode === 200) {
						out.push({ json: { output: res.body.output ?? null, receipt }, pairedItem: i });
					} else if (res.statusCode === 202) {
						// Above the mandate's approval threshold: a human decides in the Holon console.
						out.push({ json: { output: null, status: 'pending_approval', approval: receipt.approval ?? null, receipt }, pairedItem: i });
					} else {
						const message = String(res.body.error ?? receipt.error ?? `HTTP ${res.statusCode}`);
						throw new NodeApiError(this.getNode(), res.body as never, {
							message: `Holon: ${message}`,
							description: receipt.error ? `The call was not billed unless the agent declares "${receipt.error}" as billable.` : undefined,
							httpCode: String(res.statusCode),
							itemIndex: i,
						});
					}
				} else if (operation === 'search') {
					const qs: IDataObject = {};
					const query = this.getNodeParameter('query', i, '') as string;
					const capability = this.getNodeParameter('searchCapability', i, '') as string;
					if (query) qs.q = query;
					if (capability) qs.capability = capability;
					const me = await request('GET', '/v0/me');
					if (typeof me.body.mandate === 'string') qs.mandate = me.body.mandate; // an agent key: rank for its own mandate
					const res = await request('GET', '/v0/agents', { qs });
					if (res.statusCode !== 200) throw new NodeApiError(this.getNode(), res.body as never, { message: `Holon: ${res.body.error ?? res.statusCode}`, itemIndex: i });
					for (const agent of (res.body.agents as IDataObject[]) ?? []) out.push({ json: agent, pairedItem: i });
				} else {
					const res = await request('GET', '/v0/me');
					if (res.statusCode !== 200) throw new NodeApiError(this.getNode(), res.body as never, { message: `Holon: ${res.body.error ?? res.statusCode}`, itemIndex: i });
					out.push({ json: res.body, pairedItem: i });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: i });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}
