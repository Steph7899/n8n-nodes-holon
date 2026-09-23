import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * For the Holon Trigger: your Holon account (a human key, to register the workflow's token when
 * you activate it) and the token Holon sends on every call, so only Holon can start the workflow.
 */
export class HolonTriggerApi implements ICredentialType {
	name = 'holonTriggerApi';

	displayName = 'Holon Trigger API';

	icon: Icon = { light: 'file:../icons/holon.svg', dark: 'file:../icons/holon.dark.svg' };

	documentationUrl = 'https://useholon.com/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'Holon Human Key',
			name: 'humanKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'hlk_h_...',
			description:
				'The human key you get when you sign in to the Holon console with GitHub. Used only when the workflow is activated, to register its token with Holon.',
		},
		{
			displayName: 'Token',
			name: 'token',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A secret of at least 16 characters, no spaces. Holon sends it as "Authorization: Bearer <token>" on every call, and the trigger refuses calls without it.',
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
				Authorization: '=Bearer {{$credentials.humanKey}}',
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
