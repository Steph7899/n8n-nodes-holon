import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/** An agent key from the Holon console: it calls agents under the budget of one mandate. */
export class HolonApi implements ICredentialType {
	name = 'holonApi';

	displayName = 'Holon API';

	icon: Icon = { light: 'file:../icons/holon.svg', dark: 'file:../icons/holon.dark.svg' };

	documentationUrl = 'https://useholon.com/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'Agent Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'hlk_a_...',
			description:
				'An agent key from the Holon console (api.useholon.com/console). It spends from the budget of the mandate it is bound to, never more.',
		},
		{
			displayName: 'Gateway URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.useholon.com',
			description: 'Leave as is, unless you run your own Holon gateway',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v0/me',
			method: 'GET',
		},
	};
}
