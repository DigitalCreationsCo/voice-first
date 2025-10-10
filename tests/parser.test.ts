import { describe, it, expect } from 'vitest';
import { createParser, parseChunk, ParserConfig, StreamUpdate } from '@/lib/utils';

describe('StreamParser', () => {
  it('parses static fields and streams text correctly', () => {
    const config: ParserConfig = {
      keys: ['rating', 'difficulty', 'text'],
      streamKeys: ['text'],
      delimiter: ':',
      terminator: ';'
    };

    const chunk = 'rating: 5; difficulty: 2; text: Hello world';
    
    let parser = createParser(config);
    const { parser: p1, updates: u1 } = parseChunk(parser, chunk);
    parser = p1;
    
    const meta = u1.find(u => u.type === 'meta') as any;
    expect(meta).toBeDefined();
    expect(meta.data.rating).toBe(5);
    expect(meta.data.difficulty).toBe(2);
    
    const stream = u1.find(u => u.type === 'stream') as any;
    expect(stream).toBeDefined();
    expect(stream.delta).toContain('Hello world');
    
    const chunk2 = ';';
    const { parser: p2, updates: u2 } = parseChunk(parser, chunk2);
    parser = p2;

    const complete = u2.find(u => u.type === 'complete');
    expect(complete).toBeDefined();
    expect(complete!.data.text).toBe('Hello world');
  });

  it('parses incrementally streamed text chunks', () => {
    const config: ParserConfig = { keys: ['text'], streamKeys: ['text'] };
    let parser = createParser(config);

    const chunks = ['text: Hello ', 'world! This ', 'is a test.', ';'];
    let allUpdates: StreamUpdate[] = [];
    for (const c of chunks) {
      const { parser: p, updates } = parseChunk(parser, c);
      parser = p;
      allUpdates.push(...updates);
    }

    const streamDeltas = allUpdates.filter(u => u.type === 'stream') as any[];
    expect(streamDeltas.map(d => d.delta).join('')).toBe('Hello world! This is a test.');

    const complete = allUpdates.find(u => u.type === 'complete') as any;
    expect(complete.data.text).toBe('Hello world! This is a test.');
  });

  it('ignores malformed or incomplete segments until finalized', () => {
    const config: ParserConfig = { keys: ['rating', 'text'], streamKeys: ['text'] };
    let parser = createParser(config);

    const { parser: p1, updates: u1 } = parseChunk(parser, 'rating: 5');
    parser = p1;
    expect(u1.length).toBe(0);

    const { parser: p2, updates: u2 } = parseChunk(parser, ';');
    parser = p2;
    const meta = u2.find(u => u.type === 'meta') as any;
    expect(meta.data.rating).toBe(5);
    
    const { parser: p3, updates: u3 } = parseChunk(parser, 'text: Every');
    parser = p3;
    const stream = u3.find(u => u.type === "stream") as any;
    expect(stream.delta).toBe('Every');
  });

  it('trims semicolons and parses numeric fields correctly', () => {
    const config: ParserConfig = { keys: ['rating', 'difficulty', 'text'], streamKeys: ['text'], terminator: ';', delimiter: ':' };
    let parser = createParser(config);

    const { parser: p, updates } = parseChunk(parser, 'rating: 12; difficulty: 1; text: Hola;');
    parser = p;

    const meta = updates.find(u => u.type === 'meta') as any;
    expect(meta.data.rating).toBe(12);
    expect(meta.data.difficulty).toBe(1);

    const stream = updates.find(u => u.type === 'stream') as any;
    expect(stream.delta).toContain('Hola');
  });

  it('parses keys split across chunks and streams text across multiple chunks', () => {
    const config: ParserConfig = { keys: ['rating', 'text'], streamKeys: ['text'] };
    let parser = createParser(config);

    const chunks = ['rating: 3; t', 'ext: Hello ', 'World!'];
    let allUpdates: StreamUpdate[] = [];
    for (const c of chunks) {
      const { parser: p, updates } = parseChunk(parser, c);
      parser = p;
      allUpdates.push(...updates);
    }

    const meta = allUpdates.find(u => u.type === 'meta') as any;
    expect(meta.data.rating).toBe(3);

    const text = allUpdates.filter(u => u.type === 'stream').map(u => (u as any).delta).join('');
    expect(text).toBe('Hello World!');
  });

  it('handles optional key absent and emits skip when next key appears first', () => {
    const config: ParserConfig = { keys: ['rating', 'difficulty', 'text'], streamKeys: ['text'], optionalKeys: ['difficulty'] };
    let parser = createParser(config);

    const chunk = 'rating: 5; text: Test message;';
    const { parser: p, updates } = parseChunk(parser, chunk);
    parser = p;

    const skip = updates.find(u => u.type === 'skip') as any;
    expect(skip.key).toBe('difficulty');

    const meta = updates.find(u => u.type === 'meta') as any;
    expect(meta.data.rating).toBe(5);
  });
  
  it('handles all optional key absent and emits skip update', () => {
    const config: ParserConfig = { keys: ['rating', 'difficulty', 'text'], streamKeys: ['text'], optionalKeys: ['rating', 'difficulty'] };
    let parser = createParser(config);

    const chunk = 'text: Test message;';
    const { parser: p, updates } = parseChunk(parser, chunk);
    parser = p;

    const skip1 = updates.find((u: any) => u.key === 'rating') as any;
    expect(skip1).toBeDefined();
   
    const skip2 = updates.find((u: any) => u.key === 'difficulty') as any;
    expect(skip2.key).toBeDefined();

    const meta = updates.find(u => u.type === 'meta') as any;
    expect(meta.data.rating).toBeUndefined();

    const stream = updates.find(u => u.type === 'stream') as any;
    expect(stream.delta).toBe('Test message');
  });

  it('parses optional key when present (no skip)', () => {
    const config: ParserConfig = { keys: ['rating', 'difficulty', 'text'], streamKeys: ['text'], optionalKeys: ['difficulty'] };
    let parser = createParser(config);

    const chunk = 'rating: 4; difficulty: 2; text: OK;';
    const { parser: p, updates } = parseChunk(parser, chunk);
    parser = p;

    const skip = updates.find(u => u.type === 'skip');
    expect(skip).toBeUndefined();

    const meta = updates.find(u => u.type === 'meta') as any;
    expect(meta.data.difficulty).toBe(2);
  });

  it('handles multiple stream chunks and accumulates parsed text', () => {
    const config: ParserConfig = { keys: ['text'], streamKeys: ['text'] };
    let parser = createParser(config);

    const chunks1 = ['text: First ', 'chunk ', 'here.', '\n;'];
    let allUpdates: StreamUpdate[] = [];
    for (const c of chunks1) {
      const { parser: p1, updates: u1 } = parseChunk(parser, c);
      parser = p1;
      allUpdates.push(...u1);
    }

    const streamText = allUpdates.filter(u => u.type === 'stream').map(u => (u as any).delta).join('');
    expect(streamText).toBe('First chunk here.');
    

    let parser2 = createParser(config);
    const chunks2 = [`text: D'accord, commençons ! De quoi aimerais-tu parler aujourd'hui ?
;
`];
    let allUpdates2: StreamUpdate[] = [];
    for (const c of chunks2) {
      const { parser: p2, updates: u2 } = parseChunk(parser2, c);
      parser2 = p2;
      allUpdates2.push(...u2);
    }

    const streamText2 = allUpdates2.filter(u => u.type === 'stream').map(u => (u as any).delta).join('');
    expect(streamText2).toBe("D'accord, commençons ! De quoi aimerais-tu parler aujourd'hui ?");
  });
});
