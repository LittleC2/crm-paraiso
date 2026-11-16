<script>
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import Target from '@lucide/svelte/icons/target';
	import Bell from '@lucide/svelte/icons/bell';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Contact from '@lucide/svelte/icons/contact';
	import ShieldUser from '@lucide/svelte/icons/shield-user';
	import Funnel from '@lucide/svelte/icons/funnel';
	import Package from '@lucide/svelte/icons/package';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Settings from '@lucide/svelte/icons/settings';
	import LogOut from '@lucide/svelte/icons/log-out';

	// `admin: true` esconde o item da equipe da loja. A proteção real é no
	// servidor (access.js); aqui é só para não mostrar menu que daria 403.
	const LINKS = [
		{ href: '/', label: 'Hoje', icon: LayoutDashboard },
		{ href: '/agenda', label: 'Agenda', icon: CalendarDays },
		{ href: '/conversas', label: 'WhatsApp', icon: MessageCircle, badge: true },
		{ href: '/funil', label: 'Funil', icon: Funnel, admin: true },
		{ href: '/pedidos', label: 'Pedidos da loja', icon: Package, hideSolo: true },
		{ href: '/tarefas', label: 'Tarefas', icon: ListTodo },
		{ href: '/metas', label: 'Metas', icon: Target, admin: true },
		{ href: '/contatos', label: 'Contatos', icon: Contact },
		{ href: '/lembretes', label: 'Lembretes', icon: Bell },
		{ href: '/usuarios', label: 'Usuários', icon: ShieldUser, admin: true, hideSolo: true },
		{ href: '/ajustes', label: 'Ajustes', icon: Settings }
	];

	let { user, unread = 0 } = $props();
	const links = $derived(LINKS.filter((link) => (!link.admin || user?.role === 'ADMIN') && !(link.hideSolo && page.data.solo)));

	function isActive(href) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<aside class="sidebar">
	<a href={resolve('/')} class="brand">
		<img class="brand-logo" src="/logo.png" alt="" width="34" height="34" />
		<span class="brand-name">Paraíso das Plantas</span>
	</a>

	<nav class="links">
		{#each links as link (link.href)}
			<a href={resolve(link.href)} class="link" class:active={isActive(link.href)}>
				<link.icon size={18} strokeWidth={2} />
				<span class="link-label">{link.label}</span>
				{#if link.badge && unread > 0}<span class="unread">{unread > 99 ? '99+' : unread}</span>{/if}
			</a>
		{/each}
	</nav>

	<form method="POST" action={resolve('/logout')} class="logout">
		<button class="link link-button" type="submit">
			<LogOut size={18} strokeWidth={2} />
			<span class="link-label">Sair</span>
		</button>
	</form>
</aside>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		height: 100%;
		padding: 1.25rem 0.9rem;
		background: var(--color-forest);
		color: var(--color-bg);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		text-decoration: none;
		padding: 0 0.4rem;
	}

	.brand-logo {
		width: 34px;
		height: 34px;
		object-fit: contain;
		flex-shrink: 0;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
	}

	.brand-name {
		font-weight: 800;
		font-size: 0.9rem;
		line-height: 1.15;
		color: var(--color-bg);
	}

	.links {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1;
	}

	.link {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.55rem 0.6rem;
		border-radius: var(--radius-button);
		text-decoration: none;
		color: rgba(247, 245, 239, 0.75);
		font-size: 0.85rem;
		font-weight: 600;
		border: none;
		background: transparent;
		cursor: pointer;
		width: 100%;
		text-align: left;
		font-family: inherit;
		transition:
			background-color var(--transition-fast),
			color var(--transition-fast),
			transform var(--transition-fast);
	}

	.link:hover {
		background: rgba(247, 245, 239, 0.08);
		color: var(--color-bg);
	}

	.link.active {
		background: rgba(240, 180, 41, 0.16);
		color: var(--color-accent);
	}

	.unread {
		margin-left: auto;
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: 0.68rem;
		font-weight: 800;
		border-radius: 999px;
		padding: 0.05rem 0.45rem;
	}

	.logout {
		border-top: 1px solid rgba(247, 245, 239, 0.14);
		padding-top: 0.75rem;
	}

	@media (max-width: 860px) {
		.sidebar {
			flex-direction: row;
			align-items: center;
			height: auto;
			padding: 0.5rem 0.75rem;
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			z-index: 10;
		}

		.brand {
			display: none;
		}

		/* Com muitos itens, a barra rola para o lado em vez de cortar. */
		.links {
			flex-direction: row;
			flex: 1;
			min-width: 0;
			justify-content: flex-start;
			overflow-x: auto;
			scrollbar-width: none;
		}
		.links::-webkit-scrollbar {
			display: none;
		}

		.link {
			flex: 0 0 auto;
			width: auto;
			min-width: 4.4rem;
			flex-direction: column;
			gap: 0.2rem;
			padding: 0.3rem;
			font-size: 0.65rem;
			text-align: center;
		}

		.logout {
			border-top: none;
			padding-top: 0;
		}

		.logout .link-label {
			display: none;
		}
	}
</style>
