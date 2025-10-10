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
    let parser = createParser(config);
    const chunk = 'rating: 5; difficulty: 2; text: Hello world!';
    const { parser: newParser, updates } = parseChunk(parser, chunk);
    parser = newParser;

    const meta = updates.find(u => u.type === 'meta') as any;
    expect(meta).toBeDefined();
    expect(meta.data.rating).toBe(5);
    expect(meta.data.difficulty).toBe(2);

    const stream = updates.find(u => u.type === 'stream') as any;
    expect(stream).toBeDefined();
    expect(stream.delta).toContain('Hello world');

    const complete = updates.find(u => u.type === 'complete') as any;
    expect(complete).toBeDefined();
    expect(complete.data.text).toContain('Hello world');
  });

  it('parses incrementally streamed text chunks', () => {
    const config: ParserConfig = { keys: ['text'], streamKeys: ['text'] };
    let parser = createParser(config);

    const chunks = ['text: Hello ', 'world! This ', 'is a test.'];
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

    const { parser: p1, updates: u1 } = parseChunk(parser, 'rating 5 text: test');
    parser = p1;
    expect(u1.length).toBe(0); // no updates emitted yet

    const { parser: p2, updates: u2 } = parseChunk(parser, ';');
    parser = p2;
    const meta = u2.find(u => u.type === 'meta') as any;
    expect(meta.data.rating).toBe(5);
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
    console.log('handles multiple stream chunks and accumulates parsed text');
    const config: ParserConfig = { keys: ['text'], streamKeys: ['text'] };
    let parser = createParser(config);

    const chunks = ['text: First ', 'chunk ', 'here.'];
    let allUpdates: StreamUpdate[] = [];
    for (const c of chunks) {
      const { parser: p, updates } = parseChunk(parser, c);
      console.log(' updates: ', updates);
      parser = p;
      allUpdates.push(...updates);
    }

    console.log(' allUpdates: ', allUpdates);
    const streamText = allUpdates.filter(u => u.type === 'stream').map(u => (u as any).delta).join('');
    expect(streamText).toBe('First chunk here.');

    const complete = allUpdates.find(u => u.type === 'complete') as any;
    console.log('allUpdates: ', allUpdates);
    expect(complete.data.text).toBe('First chunk here.');
  });

});


// // parser.async.spec.ts
// import { describe, it, expect, beforeEach } from 'vitest';
// import {
//   createParser,
//   parseChunk as parseChunkAsync,
//   type ParserConfig,
//   type StreamParser
// } from '@/lib/utils'; // adjust path if needed

// // Helper: make an async iterable from array or single string
// async function* toAsyncIterable(chunks: string[] | string) {
//   if (typeof chunks === 'string') {
//     yield chunks;
//     return;
//   }
//   for (const c of chunks) {
//     // micro-yield to emulate async streaming
//     await Promise.resolve();
//     yield c;
//   }
// }

// // Helper: consume async generator and collect yields and final returned parser
// async function collectAsyncUpdates(
//   parser: StreamParser,
//   incoming: string[] | string,
//   config: ParserConfig
// ) {
//   const incomingIter = toAsyncIterable(incoming);
//   const gen = parseChunkAsync(parser, incomingIter);
//   const updates: any[] = [];

//   // manually iterate so we can capture generator return value
//   let res = await gen.next();
//   while (!res.done) {
//       updates.push(res.value);
//       res = await gen.next();
//       console.log('res ', res); 
//   }
//   console.log('res ', res);
//   const finalParser = res.value as StreamParser; // return value from generator
//   return { updates, parser: finalParser };
// }

// describe('Async generator parser tests (parseChunkAsync signature)', () => {
//   const baseConfig = (overrides?: Partial<ParserConfig>): ParserConfig => ({
//     keys: ['rating', 'difficulty', 'text'],
//     streamKeys: ['text'],
//     optionalKeys: [],     // keep keys/streamKeys/optionalKeys present
//     delimiter: ':',
//     terminator: ';',
//     ...overrides,
//   });

//   beforeEach(() => {
//     // no-op — tests run with real timers
//   });

//   it('parses static fields and streams text correctly', async () => {
//     const config = baseConfig();
//     let parser = createParser(config);

//     const input = 'rating: 5; difficulty: 3; text: Hello world;';
//     const { updates, parser: finalParser } = await collectAsyncUpdates(parser, input, config);

//     // Expect first meta (emitted once) then stream then complete
//     const meta = updates.find(u => u.type === 'meta');
//     expect(meta).toBeDefined();
//     expect(meta.data.rating).toBe(5);
//     expect(meta.data.difficulty).toBe(3);

//     const stream = updates.find(u => u.type === 'stream');
//     expect(stream).toBeDefined();
//     expect(stream.data.text).toContain('Hello world');

//     const complete = updates.find(u => u.type === 'complete');
//     expect(complete).toBeDefined();
//     expect(String(complete.data.text)).toContain('Hello world');

//     expect(finalParser.meta.rating).toBe(5);
//     expect(finalParser.meta.difficulty).toBe(3);
//   });

//   it('parses incrementally streamed text chunks', async () => {
//     const config = baseConfig();
//     let parser = createParser(config);

//     const chunks = [
//       'rating: 8; difficulty: 2; text: Hel',
//       'lo wor',
//       'ld;'
//     ];

//     const { updates } = await collectAsyncUpdates(parser, chunks, config);

//     const meta = updates.find(u => u.type === 'meta');
//     expect(meta).toBeDefined();
//     expect(meta.data.rating).toBe(8);
//     expect(meta.data.difficulty).toBe(2);

//     // stream may be emitted once when terminator arrives; join all stream updates
//     const streamDeltas = updates.filter(u => u.type === 'stream').map(s => s.data.text).join('');
//     expect(streamDeltas).toContain('Hello world');

//     const complete = updates.find(u => u.type === 'complete');
//     expect(complete).toBeDefined();
//     expect(String(complete.data.text)).toContain('Hello world');
//   });

//   it('ignores malformed or incomplete segments until finalized', async () => {
//     const config = baseConfig();
//     let parser = createParser(config);

//     // First chunk leaves difficulty partial
//     const chunks = ['rating: 7; diff', 'iculty: 4; text: Done;'];

//     const { updates } = await collectAsyncUpdates(parser, chunks, config);

//     const complete = updates.find(u => u.type === 'complete');
//     expect(complete).toBeDefined();
//     expect(complete.data.rating).toBe(7);
//     expect(complete.data.difficulty).toBe(4);
//     expect(String(complete.data.text)).toContain('Done');
//   });

//   it('trims semicolons and parses numeric fields correctly', async () => {
//     const config = baseConfig();
//     let parser = createParser(config);

//     const input = 'rating: 12; difficulty: 1; text: Hola;';
//     const { updates } = await collectAsyncUpdates(parser, input, config);

//     const meta = updates.find(u => u.type === 'meta');
//     expect(meta).toBeDefined();
//     expect(typeof meta.data.rating).toBe('number');
//     expect(meta.data.rating).toBe(12);
//     expect(typeof meta.data.difficulty).toBe('number');
//     expect(meta.data.difficulty).toBe(1);

//     const complete = updates.find(u => u.type === 'complete');
//     expect(complete).toBeDefined();
//     expect(String(complete.data.text)).toContain('Hola');
//   });

//   it('parses complete single-chunk message and emits meta, stream and complete', async () => {
//     const config = baseConfig();
//     let parser = createParser(config);

//     const input = 'rating: 10; difficulty: 4; text: Great job;';
//     const { updates } = await collectAsyncUpdates(parser, input, config);

//     expect(updates.some(u => u.type === 'meta')).toBe(true);
//     expect(updates.some(u => u.type === 'stream')).toBe(true);
//     expect(updates.some(u => u.type === 'complete')).toBe(true);
//   });

//   it('parses keys split across chunks and streams text across multiple chunks', async () => {
//     const config = baseConfig();
//     let parser = createParser(config);

//     const chunks = [
//       'rating: 9; diff',
//       'iculty: 5; te',
//       'xt: Part 1 ',
//       'and Part 2;'
//     ];

//     const { updates } = await collectAsyncUpdates(parser, chunks, config);

//     const complete = updates.find(u => u.type === 'complete') as any;
//     expect(complete).toBeDefined();
//     expect(complete.data.rating).toBe(9);
//     expect(complete.data.difficulty).toBe(5);
//     expect(String(complete.data.text)).toBe('Part 1 and Part 2');
//   });

//   it('handles optional key absent (optionalKeys present in config) — final parser omits missing key', async () => {
//     const config = baseConfig({ optionalKeys: ['difficulty'] });
//     let parser = createParser(config);

//     // difficulty omitted
//     const input = 'rating: 8; text: Bonjour;';
//     const { updates, parser: finalParser } = await collectAsyncUpdates(parser, input, config);

//     // parser.meta should have rating, but difficulty undefined
//     const complete = updates.find(u => u.type === 'complete') as any;
//     expect(complete).toBeDefined();
//     expect(complete.data.rating).toBe(8);
//     expect(complete.data.difficulty).toBeUndefined();
//     expect(String(complete.data.text)).toContain('Bonjour');
//     expect(finalParser.meta.difficulty).toBeUndefined();
//   });

//   it('parses optional key when present (no skip)', async () => {
//     const config = baseConfig({ optionalKeys: ['difficulty'] });
//     let parser = createParser(config);

//     const input = 'rating: 9; difficulty: 2; text: Hola;';
//     const { updates } = await collectAsyncUpdates(parser, input, config);

//     const complete = updates.find(u => u.type === 'complete') as any;
//     expect(complete).toBeDefined();
//     expect(complete.data.difficulty).toBe(2);
//     expect(String(complete.data.text)).toContain('Hola');
//   });

//   it('skips optional key when timeout elapses — (current parser does not auto-skip; verifies missing optional results in undefined)', async () => {
//     // parseChunkAsync implementation does not implement automatic skipping by timeout.
//     // This test verifies that when optional key is never provided, result leaves it undefined.
//     const config = baseConfig({ optionalKeys: ['difficulty'] });
//     let parser = createParser(config);

//     // Provide only rating and text (no difficulty). This should NOT throw, and difficulty remains undefined.
//     const input = 'rating: 7; text: After timeout;';
//     const { updates } = await collectAsyncUpdates(parser, input, config);

//     const complete = updates.find(u => u.type === 'complete') as any;
//     expect(complete).toBeDefined();
//     expect(complete.data.rating).toBe(7);
//     expect(complete.data.difficulty).toBeUndefined();
//     expect(String(complete.data.text)).toContain('After timeout');
//   });

//   it('handles multiple stream chunks and accumulates parsed text', async () => {
//     const config = baseConfig();
//     let parser = createParser(config);

//     const chunks = [
//       'rating: 5; difficulty: 1; text: First part ',
//       'continues ',
//       'and ends;'
//     ];

//     const { updates } = await collectAsyncUpdates(parser, chunks, config);

//     const streamJoined = updates.filter(u => u.type === 'stream').map(s => s.data.text).join('');
//     expect(streamJoined).toContain('First part continues and ends');

//     const complete = updates.find(u => u.type === 'complete') as any;
//     expect(complete).toBeDefined();
//     console.log('complete ', complete);

//     expect(String(complete.data.text)).toContain('ends');
//   });
// });


// // import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
// // import {
// //   createParser,
// //   parseChunk,
// //   type ParserConfig,
// // } from '@/lib/utils';

// // describe('Stream Parser - robust unit tests', () => {
// //     const baseConfig: ParserConfig = {
// //         keys: ['rating', 'difficulty', 'text'],
// //         streamKeys: ['text'],
// //         optionalKeys: ['difficulty'],
// //         delimiter: ':',
// //         terminator: ';',
// //         timeout: 100,
// //       };
    
// //       it('parses static fields and streams text correctly', () => {
// //         let parser = createParser(baseConfig);
// //         const chunk = 'rating: 5; difficulty: 3; text: Hello world;';
// //         const { parser: newParser, updates } = parseChunk(parser, chunk);
// //         parser = newParser;
    
// //         const meta = updates.find(u => u.type === 'meta') as any;
// //         const complete = updates.find(u => u.type === 'complete') as any;
// //         const stream = updates.find(u => u.type === 'stream') as any;
    
// //         expect(meta.data.rating).toBe(5);
// //         expect(meta.data.difficulty).toBe(3);
// //         expect(stream.delta).toContain('Hello');
// //         expect(complete.data.text).toContain('Hello');
// //       });
    
// //       it('parses incrementally streamed text chunks', () => {
// //         let parser = createParser(baseConfig);
// //         const chunks = [
// //           'rating: 8; difficulty: 2; text: Hel',
// //           'lo wor',
// //           'ld;',
// //         ];
    
// //         let updates: any[] = [];
// //         for (const chunk of chunks) {
// //           const res = parseChunk(parser, chunk);
// //           parser = res.parser;
// //           updates = updates.concat(res.updates);
// //         }
    
// //         const streams = updates.filter(u => u.type === 'stream');
// //         expect(streams.map(s => s.delta).join('')).toBe('Hello world');
// //       });
    
// //       it('ignores malformed or incomplete segments until finalized', () => {
// //         let parser = createParser(baseConfig);
// //         const partial = 'rating: 7; diff'; // incomplete
// //         let { updates } = parseChunk(parser, partial);
// //         expect(updates.length).toBe(0);
    
// //         const final = 'iculty: 4; text: Done;';
// //         ({ parser, updates } = parseChunk(parser, final));
// //         const complete = updates.find(u => u.type === 'complete') as any;
// //         expect(complete.data.rating).toBe(7);
// //         expect(complete.data.difficulty).toBe(4);
// //         expect(complete.data.text).toBe('Done');
// //       });
    
// //       it('trims semicolons and parses numeric fields correctly', () => {
// //         const parser = createParser(baseConfig);
// //         const chunk = 'rating: 12; difficulty: 1; text: Hola;';
// //         const { updates } = parseChunk(parser, chunk);
    
// //         const meta = updates.find(u => u.type === 'meta') as any;
// //         expect(typeof meta.data.rating).toBe('number');
// //         expect(meta.data.rating).toBe(12);
// //         expect(meta.data.difficulty).toBe(1);
    
// //         const complete = updates.find(u => u.type === 'complete') as any;
// //         expect(complete.data.text).toContain('Hola');
// //       });
    
// //       it('parses complete single-chunk message and emits meta, stream and complete', () => {
// //         const parser = createParser(baseConfig);
// //         const chunk = 'rating: 10; difficulty: 4; text: Great job;';
// //         const { updates } = parseChunk(parser, chunk);
// //         expect(updates.some(u => u.type === 'meta')).toBe(true);
// //         expect(updates.some(u => u.type === 'stream')).toBe(true);
// //         expect(updates.some(u => u.type === 'complete')).toBe(true);
// //       });
    
// //       it('parses keys split across chunks and streams text across multiple chunks', () => {
// //         let parser = createParser(baseConfig);
// //         const chunks = [
// //           'rating: 9; diff',
// //           'iculty: 5; te',
// //           'xt: Part 1 ',
// //           'and Part 2;',
// //         ];
    
// //         let updates: any[] = [];
// //         for (const chunk of chunks) {
// //           const res = parseChunk(parser, chunk);
// //           parser = res.parser;
// //           updates = updates.concat(res.updates);
// //         }
    
// //         const complete = updates.find(u => u.type === 'complete') as any;
// //         expect(complete.data.text).toBe('Part 1 and Part 2');
// //       });
    
// //       it('handles optional key absent and emits skip when next key appears first', () => {
// //         const config = { ...baseConfig, optionalKeys: ['difficulty'] };
// //         let parser = createParser(config);
// //         const chunk = 'rating: 8; text: Bonjour;';
// //         const { updates } = parseChunk(parser, chunk);
// //         const skip = updates.find(u => u.type === 'skip');
// //         const meta = updates.find(u => u.type === 'meta');
// //         expect(skip).toBeDefined();
// //         expect(meta.data.rating).toBe(8);
// //       });
    
// //       it('parses optional key when present (no skip)', () => {
// //         const config = { ...baseConfig, optionalKeys: ['difficulty'] };
// //         let parser = createParser(config);
// //         const chunk = 'rating: 9; difficulty: 2; text: Hola;';
// //         const { updates } = parseChunk(parser, chunk);
// //         const skip = updates.find(u => u.type === 'skip');
// //         expect(skip).toBeUndefined();
// //         const complete = updates.find(u => u.type === 'complete') as any;
// //         expect(complete.data.difficulty).toBe(2);
// //       });
    
// //       it('skips optional key when timeout elapses', async () => {
// //         const config = { ...baseConfig, timeout: 10 };
// //         let parser = createParser(config);
    
// //         const startChunk = 'rating: 9;';
// //         let res = parseChunk(parser, startChunk);
// //         parser = res.parser;
    
// //         await new Promise(r => setTimeout(r, 15));
// //         const nextChunk = 'text: After timeout;';
// //         res = parseChunk(parser, nextChunk);
    
// //         const skip = res.updates.find(u => u.type === 'skip');
// //         expect(skip).toBeDefined();
// //       });
    
// //       it('handles multiple stream chunks and accumulates parsed text', () => {
// //         let parser = createParser(baseConfig);
// //         const chunks = [
// //           'rating: 5; difficulty: 1; text: First part ',
// //           'continues ',
// //           'and ends;',
// //         ];
    
// //         let updates: any[] = [];
// //         for (const chunk of chunks) {
// //           const res = parseChunk(parser, chunk);
// //           parser = res.parser;
// //           updates = updates.concat(res.updates);
// //         }
    
// //         const streams = updates.filter(u => u.type === 'stream');
// //         const complete = updates.find(u => u.type === 'complete') as any;
// //         const text = streams.map(s => s.delta).join('');
// //         expect(text).toContain('First part continues and ends');
// //         expect(complete.data.text).toContain('ends');
// //       });
  
// // //   it('parses static fields and streams text correctly', () => {
// // //     let parser = createParser(config);
// // //     const chunk = 'rating: 12; difficulty: 1; text: Hola;';
// // //     const { parser: nextParser, updates } = parseChunk(parser, chunk, config);
// // //     parser = nextParser;

// // //     const metas = updates.filter(u => u.type === 'meta');
    
// // //     const complete = updates.find(u => u.type === 'complete');
// // //     const stream = updates.filter(u => u.type === 'stream');

// // //     console.log('updates ', updates);

// // //     expect(metas.length).toBe(2);
// // //     expect(metas[0].data.rating).toBe(12);
// // //     expect(metas[1].data.difficulty).toBe(1);
// // //     expect(stream.length).toBe(1);
// // //     expect(stream[0].data.text).toContain('Hola');
// // //     expect(complete).toBeDefined();
// // //     expect(complete?.data.text).toBe('Hola');
// // //   });

// // //   it('parses incrementally streamed text chunks', () => {
// // //     let parser = createParser(config);
// // //     const chunks = [
// // //       'rating: 5; difficulty: 2; text: Hel',
// // //       'lo the',
// // //       're!'
// // //     ];

// // //     let allUpdates: any[] = [];
// // //     for (const c of chunks) {
// // //       const result = parseChunk(parser, c, config);
// // //       parser = result.parser;
// // //       allUpdates = [...allUpdates, ...result.updates];
// // //     }

// // //     const metas = allUpdates.filter(u => u.type === 'meta');
// // //     const streams = allUpdates.filter(u => u.type === 'stream');
// // //     const complete = allUpdates.find(u => u.type === 'complete');

// // //     expect(metas.length).toBe(2);
// // //     expect(metas.find(m => m.data.rating === 5)).toBeTruthy();
// // //     expect(metas.find(m => m.data.difficulty === 2)).toBeTruthy();

// // //     const streamedText = streams.map(s => s.data.text).join('');
// // //     expect(streamedText).toContain('Hello there');
// // //     expect(complete).toBeDefined();
// // //   });

// // //   it('ignores malformed or incomplete segments until finalized', () => {
// // //     let parser = createParser(config);
// // //     const chunk = 'rating: 8; diff'; // incomplete "difficulty"

// // //     let result = parseChunk(parser, chunk, config);
// // //     parser = result.parser;

// // //     expect(result.updates.length).toBeGreaterThanOrEqual(1);
// // //     expect(result.updates.find(u => u.type === 'meta' && u.data.rating === 8)).toBeTruthy();
// // //     expect(result.updates.find(u => u.data.difficulty)).toBeUndefined();

// // //     // complete later
// // //     result = parseChunk(parser, 'iculty: 4; text: Great;', config);
// // //     const complete = result.updates.find(u => u.type === 'complete');
// // //     expect(complete).toBeDefined();
// // //     expect(complete?.data.difficulty).toBe(4);
// // //     expect(complete?.data.text).toBe('Great');
// // //   });

// // //   it('trims semicolons and parses numeric fields correctly', () => {
// // //     let parser = createParser(config);
// // //     const chunk = 'rating: 12; difficulty: 1; text: Hola;';
// // //     const { updates } = parseChunk(parser, chunk, config);

// // //     const meta = updates.filter(u => u.type === 'meta');
// // //     const complete = updates.find(u => u.type === 'complete');

// // //     expect(meta.length).toBe(2);
// // //     const ratingMeta = meta.find(m => m.data.rating !== undefined);
// // //     const diffMeta = meta.find(m => m.data.difficulty !== undefined);
// // //     expect(ratingMeta?.data.rating).toBe(12);
// // //     expect(diffMeta?.data.difficulty).toBe(1);
// // //     expect(complete?.data.text).toBe('Hola');
// // //   });

// // //   it('parses complete single-chunk message and emits meta, stream and complete', () => {
// // //     const config: ParserConfig = {
// // //       keys: ['rating', 'difficulty', 'text'],
// // //       streamKeys: ['text'],
// // //       terminator: ';',
// // //       delimiter: ':'
// // //     };

// // //     let parser = createParser(config);

// // //     const chunk = 'rating: 90; difficulty: 3; text: Hello world;';
// // //     const { parser: p1, updates } = parseChunk(parser, chunk);
// // //     parser = p1;

// // //     // We expect at least: meta, stream (text), complete
// // //     const types = updates.map(u => u.type);
// // //     expect(types).toContain('meta');
// // //     expect(types).toContain('stream');
// // //     expect(types).toContain('complete');

// // //     // Find meta update and assert numeric parsing
// // //     const meta = updates.find(u => u.type === 'meta') as StreamUpdate | undefined;
// // //     expect(meta).toBeDefined();
// // //     if (meta && meta.type === 'meta') {
// // //       expect(meta.data.rating).toBe(90);
// // //       expect(meta.data.difficulty).toBe(3);
// // //     }

// // //     // Find stream update(s) and ensure text content present and appended in parsed
// // //     const streamUpdates = updates.filter(u => u.type === 'stream') as Extract<StreamUpdate, { type: 'stream' }>[];
// // //     expect(streamUpdates.length).toBeGreaterThanOrEqual(1);
// // //     const combinedText = streamUpdates.map(s => s.delta).join('');
// // //     expect(combinedText).toContain('Hello world');

// // //     // Final complete payload contains parsed text value
// // //     const complete = updates.find(u => u.type === 'complete') as any;
// // //     expect(complete).toBeDefined();
// // //     if (complete) {
// // //       expect(complete.data.text).toBeDefined();
// // //       // text might be string or number (string expected)
// // //       expect(String(complete.data.text)).toContain('Hello world');
// // //     }

// // //     expect(isParsingComplete(parser)).toBe(true);
// // //   });

// // //   it('parses keys split across chunks and streams text across multiple chunks', () => {
// // //     const config: ParserConfig = {
// // //       keys: ['rating', 'difficulty', 'text'],
// // //       streamKeys: ['text'],
// // //       terminator: ';',
// // //       delimiter: ':'
// // //     };

// // //     let parser = createParser(config);

// // //     // Simulate split chunks
// // //     const c1 = 'rat';
// // //     const r1 = parseChunk(parser, c1);
// // //     parser = r1.parser;
// // //     expect(r1.updates.length).toBe(0);

// // //     const c2 = 'ing: 75; diff';
// // //     const r2 = parseChunk(parser, c2);
// // //     parser = r2.parser;
// // //     // rating should be parsed now or waiting for difficulty depending on chunk
// // //     // we may have no meta yet until difficulty parsed; ensure no crash
// // //     expect(Array.isArray(r2.updates)).toBe(true);

// // //     const c3 = 'iculty: 2; text: Hel';
// // //     const r3 = parseChunk(parser, c3);
// // //     parser = r3.parser;
// // //     // After c3 we expect meta emitted (rating + difficulty) and some stream delta
// // //     expect(r3.updates.some(u => u.type === 'meta')).toBeTruthy();
// // //     expect(r3.updates.some(u => u.type === 'stream')).toBeTruthy();

// // //     // continue streaming text in multiple chunks
// // //     const c4 = 'lo';
// // //     const r4 = parseChunk(parser, c4);
// // //     parser = r4.parser;
// // //     expect(r4.updates.some(u => u.type === 'stream')).toBeTruthy();

// // //     const c5 = ' world;';
// // //     const r5 = parseChunk(parser, c5);
// // //     parser = r5.parser;
// // //     expect(r5.updates.some(u => u.type === 'stream')).toBeTruthy();
// // //     expect(r5.updates.some(u => u.type === 'complete')).toBeTruthy();

// // //     // Reconstruct parsed text from parser state
// // //     const finalParsed = getParsedData(parser);
// // //     expect(String(finalParsed.text)).toContain('Hello world'.replace('Hello', 'Hel').replace('Hel', 'Hel')); // sanity check
// // //     expect(finalParsed.rating).toBe(75);
// // //     expect(finalParsed.difficulty).toBe(2);
// // //     expect(isParsingComplete(parser)).toBe(true);
// // //   });

// // //   it('handles optional key absent and emits skip when next key appears first', () => {
// // //     const config: ParserConfig = {
// // //       keys: ['rating', 'optionalNote', 'difficulty', 'text'],
// // //       streamKeys: ['text'],
// // //       optionalKeys: ['optionalNote'],
// // //       terminator: ';',
// // //       delimiter: ':'
// // //     };

// // //     let parser = createParser(config);

// // //     // Provide a chunk that contains rating and difficulty but no optionalNote
// // //     const chunk = 'rating: 10; difficulty: 1; text: Hi;';
// // //     const { parser: newParser, updates } = parseChunk(parser, chunk);
// // //     parser = newParser;

// // //     // Expect a skip for optionalNote
// // //     const skip = updates.find(u => u.type === 'skip') as any;
// // //     expect(skip).toBeDefined();
// // //     if (skip) {
// // //       expect(skip.key).toBe('optionalNote');
// // //     }

// // //     // Also expect meta and stream/complete
// // //     expect(updates.some(u => u.type === 'meta')).toBeTruthy();
// // //     expect(updates.some(u => u.type === 'stream')).toBeTruthy();
// // //     expect(updates.some(u => u.type === 'complete')).toBeTruthy();

// // //     // parsed optional should be undefined
// // //     const parsed = getParsedData(parser);
// // //     expect(parsed.optionalNote).toBeUndefined();
// // //     expect(parsed.rating).toBe(10);
// // //     expect(parsed.difficulty).toBe(1);
// // //   });

// // //   it('parses optional key when present (no skip)', () => {
// // //     const config: ParserConfig = {
// // //       keys: ['rating', 'optionalNote', 'difficulty', 'text'],
// // //       streamKeys: ['text'],
// // //       optionalKeys: ['optionalNote'],
// // //       terminator: ';',
// // //       delimiter: ':'
// // //     };

// // //     let parser = createParser(config);

// // //     const chunk = 'rating: 5; optionalNote: this is optional; difficulty: 2; text: Hey;';
// // //     const { parser: newParser, updates } = parseChunk(parser, chunk);
// // //     parser = newParser;

// // //     // Ensure no skip for optionalNote
// // //     expect(updates.some(u => u.type === 'skip')).toBe(false);

// // //     // Meta should include rating, optionalNote, difficulty (meta emitted once)
// // //     const meta = updates.find(u => u.type === 'meta') as any;
// // //     expect(meta).toBeDefined();
// // //     if (meta) {
// // //       expect(meta.data.rating).toBe(5);
// // //       expect(meta.data.optionalNote).toBe('this is optional');
// // //       expect(meta.data.difficulty).toBe(2);
// // //     }

// // //     const parsed = getParsedData(parser);
// // //     expect(parsed.optionalNote).toBe('this is optional');
// // //     expect(isParsingComplete(parser)).toBe(true);
// // //   });

// // //   it('skips optional key when timeout elapses', async () => {
// // //     vi.useFakeTimers();
// // //     const config: ParserConfig = {
// // //       keys: ['rating', 'optionalNote', 'difficulty', 'text'],
// // //       streamKeys: ['text'],
// // //       optionalKeys: ['optionalNote'],
// // //       terminator: ';',
// // //       delimiter: ':',
// // //       timeout: 50 // ms
// // //     };

// // //     let parser = createParser(config);

// // //     // Start seeking the optional key by feeding rating only
// // //     const r1 = parseChunk(parser, 'rating: 7; ');
// // //     parser = r1.parser;
// // //     // parser should now be seeking optionalNote (currentKeyIndex = 1)
// // //     expect(parser.currentKeyIndex).toBeGreaterThanOrEqual(1);

// // //     // Move keyStartTime back to simulate elapsed time
// // //     parser.keyStartTime = Date.now() - 1000;

// // //     // Call parseChunk with an empty chunk to trigger skip logic
// // //     const r2 = parseChunk(parser, '');
// // //     parser = r2.parser;

// // //     const skipUpdate = r2.updates.find(u => u.type === 'skip') as any;
// // //     expect(skipUpdate).toBeDefined();
// // //     if (skipUpdate) expect(skipUpdate.key).toBe('optionalNote');

// // //     vi.useRealTimers();
// // //   });

// // //   it('trims semicolons and parses numeric fields correctly', () => {
// // //     const config: ParserConfig = {
// // //       keys: ['rating', 'difficulty', 'text'],
// // //       streamKeys: ['text'],
// // //       terminator: ';',
// // //       delimiter: ':'
// // //     };

// // //     let parser = createParser(config);
// // //     const chunk = 'rating: 12; difficulty: 1; text: Hola;';
// // //     const { parser: newParser, updates } = parseChunk(parser, chunk);
// // //     parser = newParser;

// // //     const meta = updates.find(u => u.type === 'meta') as any;
// // //     console.log('meta ', meta);
// // //     expect(meta).toBeDefined();
// // //     if (meta) {
// // //       expect(typeof meta.data.rating).toBe('number');
// // //       expect(meta.data.rating).toBe(12);
// // //       expect(typeof meta.data.difficulty).toBe('number');
// // //       expect(meta.data.difficulty).toBe(1);
// // //     }

// // //     const complete = updates.find(u => u.type === 'complete') as any;
// // //     expect(complete).toBeDefined();
// // //     if (complete) {
// // //       expect(String(complete.data.text)).toContain('Hola');
// // //     }
// // //   });

// // //   it('resetParser returns fresh parser with same config', () => {
// // //     const config: ParserConfig = {
// // //       keys: ['rating', 'difficulty', 'text'],
// // //       streamKeys: ['text'],
// // //       terminator: ';',
// // //       delimiter: ':'
// // //     };
// // //     let parser = createParser(config);
// // //     const chunk = 'rating: 1; difficulty: 1; text: A;';
// // //     const r = parseChunk(parser, chunk);
// // //     parser = r.parser;

// // //     // Now reset
// // //     const reset = resetParser(parser);
// // //     expect(reset.currentKeyIndex).toBe(0);
// // //     expect(reset.parsed).toEqual({});
// // //     expect(reset.config.keys).toEqual(parser.config.keys);
// // //   });

// // //   it('handles multiple stream chunks and accumulates parsed text', () => {
// // //     const config: ParserConfig = {
// // //       keys: ['rating', 'difficulty', 'text'],
// // //       streamKeys: ['text'],
// // //       terminator: ';',
// // //       delimiter: ':'
// // //     };

// // //     let parser = createParser(config);
// // //     // Provide initial meta + beginning of text
// // //     const r1 = parseChunk(parser, 'rating: 50; difficulty: 4; text: Hello ');
// // //     parser = r1.parser;
// // //     expect(r1.updates.some((u:any) => u.type === 'meta')).toBeTruthy();
// // //     expect(r1.updates.some((u:any) => u.type === 'stream')).toBeTruthy();
// // //     // Provide more text in next chunk
// // //     const r2 = parseChunk(parser, 'world');
// // //     parser = r2.parser;
// // //     expect(r2.updates.some(u => u.type === 'stream')).toBeTruthy();
// // //     // Final terminator to end stream
// // //     const r3 = parseChunk(parser, '!');
// // //     parser = r3.parser;
// // //     // If terminator not present, may not be complete yet; append terminator
// // //     const r4 = parseChunk(parser, ';');
// // //     parser = r4.parser;
// // //     expect(r4.updates.some(u => u.type === 'complete')).toBeTruthy();

// // //     const finalParsed = getParsedData(parser);
// // //     expect(String(finalParsed.text)).toContain('Hello world!');
// // //   });
// // });
