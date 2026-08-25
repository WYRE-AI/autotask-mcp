// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://WYRE-AI.github.io',
	base: '/autotask-mcp',
	integrations: [
		starlight({
			title: 'Autotask MCP',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/WYRE-AI/autotask-mcp' }],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Configuration', slug: 'getting-started/configuration' },
					],
				},
				{
					label: 'Prompt Examples',
					items: [
						{ label: 'Overview', slug: 'examples/overview' },
						{ label: 'Companies & Contacts', slug: 'examples/companies-contacts' },
						{ label: 'Tickets & Support', slug: 'examples/tickets' },
						{ label: 'Projects & Tasks', slug: 'examples/projects-tasks' },
						{ label: 'Time & Billing', slug: 'examples/time-billing' },
						{ label: 'Notes & Attachments', slug: 'examples/notes-attachments' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Tools', slug: 'reference/tools' },
						{ label: 'Resources', slug: 'reference/resources' },
						{ label: 'Transports', slug: 'reference/transports' },
					],
				},
			],
		}),
	],
});
