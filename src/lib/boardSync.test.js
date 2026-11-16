import { describe, expect, it } from 'vitest';
import { createBoardSync } from './boardSync.js';

describe('createBoardSync', () => {
	it('aplica na hora quando está livre', () => {
		const seen = [];
		const s = createBoardSync((n) => seen.push(n));
		s.offer('a');
		expect(seen).toEqual(['a']);
	});

	it('segura dados durante o arrasto e aplica só o último ao soltar', () => {
		const seen = [];
		const s = createBoardSync((n) => seen.push(n));
		s.dragStart();
		s.offer('velho');
		s.offer('novo');
		expect(seen).toEqual([]);
		s.dragEnd();
		expect(seen).toEqual(['novo']);
	});

	it('soltar com gravação pendente não ressincroniza até terminar', () => {
		const seen = [];
		const s = createBoardSync((n) => seen.push(n));
		s.dragStart();
		s.begin();
		s.dragEnd();
		s.offer('estado antigo do servidor');
		expect(seen).toEqual([]);
		expect(s.lastPending).toBe(true);
		s.end();
		expect(seen).toEqual(['estado antigo do servidor']);
	});

	it('force descarta o que estava guardado', () => {
		const seen = [];
		const s = createBoardSync((n) => seen.push(n));
		s.begin();
		s.offer('x');
		s.force('y');
		s.end();
		expect(seen).toEqual(['y']);
	});
});
