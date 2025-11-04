import { describe, it, expect } from 'vitest';
import { createParser, parseChunk, ParserConfig, StreamUpdate } from '../parser.js';

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

  it('parses keys split across chunks', () => {
    const config: ParserConfig = { keys: ['rating', 'difficulty', 'text'], streamKeys: ['text'] };
    let parser = createParser(config);

    const chunks = ['rati', 'ng: 3; difficul', 'ty: 4; t', 'ext: Hello ', 'World!'];
    let allUpdates: StreamUpdate[] = [];
    for (const c of chunks) {
      const { parser: p, updates } = parseChunk(parser, c);
      parser = p;
      allUpdates.push(...updates);
    }

    const meta = allUpdates.find(u => u.type === 'meta') as any;
    expect(meta.data.rating).toBe(3);
    expect(meta.data.difficulty).toBe(4);
  });

  it('parses keys split across chunks 2', () => {
    const config: ParserConfig = {
      keys: ['rating', 'difficulty', 'translations', 'text'],
      streamKeys: ['text'],
      jsonKeys: ['translations']
    };
    let parser = createParser(config);

    const chunks = ['rating', ': null;', 'difficulty: 1; translations: [{"word": "Hallo", "translation":', '"Hello", "phonetic": "HAH-loh", "audio": "<', 'url>"}, {"word": "Thema", "translation": "topic", "phonetic": "TEH-mah", "audio": "<url>"}', '{"word": "interessiert", "translation": "interested", "phonetic": "in-teh-REH-stee-rt", "audio":', '"<url>"}]; text: Hallo! Schön, dich zu sehen. Bist du bereit für unsere heutige Lektion?;'];
    let allUpdates: StreamUpdate[] = [];
    for (const c of chunks) {
      const { parser: p, updates } = parseChunk(parser, c);
      parser = p;
      allUpdates.push(...updates);
    }

    const meta = allUpdates.find(u => u.type === 'meta') as any;
    expect(meta.data.rating).toBe("null");
    expect(meta.data.difficulty).toBe(1);
    expect(meta.data.translations).toBeDefined();
  });
 
  it('parses jsonKeys when optionalKeys is omitted and when present', () => {
    const terminatingChar = ';';
  // Config WITH translations as optional
  const configWithOptional: ParserConfig = {
    keys: ["rating", "difficulty", "translations", "text"],
    streamKeys: ["text"],
    optionalKeys: ["rating", "difficulty", "translations"],
    jsonKeys: ["translations"],
    terminator: terminatingChar,
    delimiter: ':'
  };
  // Config WITHOUT optionalKeys
  const configWithoutOptional: ParserConfig = {
    keys: ["rating", "difficulty", "translations", "text"],
    streamKeys: ["text"],
    jsonKeys: ["translations"],
    terminator: terminatingChar,
    delimiter: ':'
  };

  const chunks = [
    'rating:null;', 'difficulty:1;',
    'translations: [{"word": "Hallo", "translation": "Hello", "phonetic": "HAH-loh", "audio": "<url>"}, {"word": "Thema", "translation": "topic", "phonetic": "TEH-mah", "audio": "<url>"}, {"word": "interessiert", "translation": "interested", "phonetic": "in-teh-REH-stee-rt", "audio": "<url>"}]; text: Hallo! Schön, dich zu sehen. Bist du bereit für unsere heutige Lektion?;'
  ];

  // Run parser with optionalKeys
  let parserOptional = createParser(configWithOptional);
  let allUpdatesOptional: StreamUpdate[] = [];
  for (const c of chunks) {
    const { parser: p, updates } = parseChunk(parserOptional, c);
    parserOptional = p;
    allUpdatesOptional.push(...updates);
  }

  const metaOptional = allUpdatesOptional.find(u => u.type === 'meta') as any;
  const streamOptional = allUpdatesOptional.find(u => u.type === 'stream') as any;

  // translations should be defined (not skipped) as present
  expect(metaOptional.data.rating).toBe("null");
  expect(metaOptional.data.difficulty).toBe(1);
  expect(metaOptional.data.translations).toBeDefined();
  expect(streamOptional.delta).toBe('Hallo! Schön, dich zu sehen. Bist du bereit für unsere heutige Lektion?');

  // Now test with NO optionalKeys defined (translations should also be parsed)
  let parserNoOptional = createParser(configWithoutOptional);
  let allUpdatesNoOptional: StreamUpdate[] = [];
  for (const c of chunks) {
    const { parser: p, updates } = parseChunk(parserNoOptional, c);
    parserNoOptional = p;
    allUpdatesNoOptional.push(...updates);
  }

  const metaNoOptional = allUpdatesNoOptional.find(u => u.type === 'meta') as any;
  const streamNoOptional = allUpdatesNoOptional.find(u => u.type === 'stream') as any;

  // Should still parse translations
  expect(metaNoOptional.data.translations).toBeDefined();
  expect(streamNoOptional.delta).toBe('Hallo! Schön, dich zu sehen. Bist du bereit für unsere heutige Lektion?');
});

  it('parses jsonKey when jsonKey is optional', () => {
    const terminatingChar = ';';
  // Config WITH translations as optional
  const configWithOptional: ParserConfig = {
    keys: ["rating", "difficulty", "translations", "text"],
    streamKeys: ["text"],
    optionalKeys: ["rating", "difficulty", "translations"],
    jsonKeys: ["translations"],
    terminator: terminatingChar,
    delimiter: ':'
  };

  const chunks = [
    'rating',':null;','difficulty:1;',
    'translations: [{"word": "Hallo", "translation": "Hello", "phonetic": "HAH-loh", "audio": "<url>"}, {"word": "Thema", "translation": "topic", "phonetic": "TEH-mah", "audio": "<url>"}, {"word": "interessiert", "translation": "interested", "phonetic": "in-teh-REH-stee-rt", "audio": "<url>"}]; text: Hallo! Schön, dich zu sehen. Bist du bereit für unsere heutige Lektion?;'
  ];

  // Run parser with optionalKeys
  let parserOptional = createParser(configWithOptional);
  let allUpdatesOptional: StreamUpdate[] = [];
  for (const c of chunks) {
    const { parser: p, updates } = parseChunk(parserOptional, c);
    parserOptional = p;
    allUpdatesOptional.push(...updates);
  }

  const metaOptional = allUpdatesOptional.find(u => u.type === 'meta') as any;
  const streamOptional = allUpdatesOptional.find(u => u.type === 'stream') as any;

  // translations should be defined (not skipped) as present
  expect(metaOptional.data.rating).toBe("null");
  expect(metaOptional.data.difficulty).toBe(1);
  expect(metaOptional.data.translations).toBeDefined();
  expect(streamOptional.delta).toBe('Hallo! Schön, dich zu sehen. Bist du bereit für unsere heutige Lektion?');
});
  
it('parses jsonKeys across split chunks when jsonKey is optional', () => {
    const terminatingChar = ';';
  // Config WITH translations as optional
  const configWithOptional: ParserConfig = {
    keys: ["rating", "difficulty", "translations", "text"],
    streamKeys: ["text"],
    optionalKeys: ["rating", "difficulty", "translations"],
    jsonKeys: ["translations"],
    terminator: terminatingChar,
    delimiter: ':'
  };

  const chunks = [
    'rating',':null;','difficulty:1;translations:',
    '[{"word": "Hallo", "translation": "Hello", "phonetic": "HAH-loh", "audio": "<url>"}, {"word": "Thema", "translation": "topic", "phonetic": "TEH-mah", "audio": "<url>"}, {"word": "interessiert", "translation": "interested", "phonetic": "in-teh-REH-stee-rt", "audio": "<url>"}]; text: Hallo! Schön, dich zu sehen. Bist du bereit für unsere heutige Lektion?;'
  ];

  // Run parser with optionalKeys
  let parserOptional = createParser(configWithOptional);
  let allUpdatesOptional: StreamUpdate[] = [];
  for (const c of chunks) {
    const { parser: p, updates } = parseChunk(parserOptional, c);
    parserOptional = p;
    allUpdatesOptional.push(...updates);
  }

  const metaOptional = allUpdatesOptional.find(u => u.type === 'meta') as any;
  const streamOptional = allUpdatesOptional.find(u => u.type === 'stream') as any;

  // translations should be defined (not skipped) as present
  expect(metaOptional.data.rating).toBe("null");
  expect(metaOptional.data.difficulty).toBe(1);
  expect(metaOptional.data.translations).toBeDefined();
  expect(streamOptional.delta).toBe('Hallo! Schön, dich zu sehen. Bist du bereit für unsere heutige Lektion?');
});

it('parses jsonKeys across split chunks when jsonKey is optional #2', () => {
    const terminatingChar = ';';
  // Config WITH translations as optional
  const configWithOptional: ParserConfig = {
    keys: ["rating", "difficulty", "translations", "text"],
    streamKeys: ["text"],
    optionalKeys: ["rating", "difficulty", "translations"],
    jsonKeys: ["translations"],
    terminator: terminatingChar,
    delimiter: ':'
  };

  const chunks = [
    'rating',
    ': null;',
    ' difficulty: 1; translations: [{"word": "Hallo", "translation":',
    ' "Hello", "phonetic": "hah-loh", "audio": "<url>"},',
    ' {"word": "Sprechen", "translation": "to speak", "phonetic": "shpreh-ken", "audio": "<url>"}, {"word',
    '": "wir", "translation": "we", "phonetic": "veer", "audio": "<url>"}, {"word": "Deutsch", "translation":',
    ' "German", "phonetic": "doytch", "audio": "<url>"}]; text: Hallo! Ja, wir sprechen Deutsch miteinander.;'
  ];

  // Run parser with optionalKeys
  let parserOptional = createParser(configWithOptional);
  let allUpdatesOptional: StreamUpdate[] = [];
  for (const c of chunks) {
    const { parser: p, updates } = parseChunk(parserOptional, c);
    parserOptional = p;
    allUpdatesOptional.push(...updates);
  }

  const metaOptional = allUpdatesOptional.find(u => u.type === 'meta') as any;
  const streamOptional = allUpdatesOptional.find(u => u.type === 'stream') as any;

  // translations should be defined (not skipped) as present
  expect(metaOptional.data.rating).toBe("null");
  expect(metaOptional.data.difficulty).toBe(1);
  console.log(metaOptional.data.translations);
  expect(metaOptional.data.translations).toBeDefined();
  expect(streamOptional.delta).toBe('Hallo! Ja, wir sprechen Deutsch miteinander.');
});

it('jsonKeys retain their data structure', () => {
  // Config WITH translations as optional
  const configWithOptional: ParserConfig = {
    keys: ["rating", "difficulty", "translations", "text"],
    streamKeys: ["text"],
    optionalKeys: ["rating", "difficulty", "translations"],
    jsonKeys: ["translations"],
    terminator: ';',
    delimiter: ':'
  };

  const chunks = [
    'rating',
    ': null;',
    ' difficulty: 1; translations: [{"word": "Hallo", "translation":',
    ' "Hello", "phonetic": "hah-loh", "audio": "<url>"},',
    ' {"word": "Sprechen", "translation": "to speak", "phonetic": "shpreh-ken", "audio": "<url>"}, {"word',
    '": "wir", "translation": "we", "phonetic": "veer", "audio": "<url>"}, {"word": "Deutsch", "translation":',
    ' "German", "phonetic": "doytch", "audio": "<url>"}]; text: Hallo! Ja, wir sprechen Deutsch miteinander.;'
  ];

  // Run parser with optionalKeys
  let parserOptional = createParser(configWithOptional);
  let allUpdatesOptional: StreamUpdate[] = [];
  for (const c of chunks) {
    const { parser: p, updates } = parseChunk(parserOptional, c);
    parserOptional = p;
    allUpdatesOptional.push(...updates);
  }

  const metaOptional = allUpdatesOptional.find(u => u.type === 'meta') as any;
  expect(Array.isArray(metaOptional.data.translations)).toBeTruthy();
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
   
    const complete = updates.find(u => u.type === 'complete') as any;
    expect(complete.data.difficulty).toBe(2);
  });

  it('parses JSON output from static key like translations', () => {
    const config: ParserConfig = { 
      keys: ['translations', 'text'], 
      streamKeys: ['text'], 
      optionalKeys: [] 
    };
    let parser = createParser(config);

    const chunk = `translations: [{"word": "hablaremos", "translation": "we will talk (future tense of hablar)", "phonetic": "ah-blah-REH-mos", "audio": "<url>"}, {"word": "comida", "translation": "food (noun)", "phonetic": "koh-MEE-dah", "audio": "<url>"}]; text: Hello;`;
    const { parser: p, updates } = parseChunk(parser, chunk);
    parser = p;

    const meta = updates.find(u => u.type === 'meta') as any;
    expect(meta).toBeDefined();
    expect(meta.data.translations).toBeDefined();
    expect(JSON.parse(meta.data.translations)).toBeDefined();

    const translations = JSON.parse(meta.data.translations);
    expect(Array.isArray(translations)).toBe(true);
    expect(translations.length).toBe(2);
    expect(translations[0]).toEqual({
      word: "hablaremos",
      translation: "we will talk (future tense of hablar)",
      phonetic: "ah-blah-REH-mos",
      audio: "<url>"
    });
    expect(translations[1].word).toBe("comida");

    const stream = updates.find(u => u.type === 'stream') as any;
    expect(stream.delta).toBe("Hello");
  });
  
  it('handles all optional key when present', () => {
    const config: ParserConfig = { 
      keys: ['rating', 'difficulty', 'translations', 'text'], 
      streamKeys: ['text'], 
      optionalKeys: ['rating', 'translations', 'difficulty'] 
    };
    let parser = createParser(config);

    const chunk = `rating: 8; difficulty: 2; translations: [{"word": "hablaremos", "translation": "we will talk (future tense of hablar)", "phonetic": "ah-blah-REH-mos", "audio": "<url>"}, {"word": "comida", "translation": "food (noun)", "phonetic": "koh-MEE-dah", "audio": "<url>"}]; text: Hello;`;
    const { parser: p, updates } = parseChunk(parser, chunk);
    parser = p;

    const meta = updates.find(u => u.type === 'meta') as any;
    expect(meta).toBeDefined();
    expect(meta.data.translations).toBeDefined();
    expect(meta.data.rating).toBe(8);
    expect(meta.data.difficulty).toBe(2);

    const complete = updates.find(u => u.type === 'complete') as any;
    expect(complete.data.rating).toBe(8);
  });
  
  it('keys must be order of input to be parsed', () => {
    const config: ParserConfig = { 
      keys: ['translations', 'difficulty', 'rating', 'text'], 
      streamKeys: ['text'], 
      optionalKeys: ['rating', 'translations', 'difficulty'] 
    };
    let parser = createParser(config);

    const chunk = `rating: 8; difficulty: 2; translations: [{"word": "hablaremos", "translation": "we will talk (future tense of hablar)", "phonetic": "ah-blah-REH-mos", "audio": "<url>"}, {"word": "comida", "translation": "food (noun)", "phonetic": "koh-MEE-dah", "audio": "<url>"}]; text: Hello;`;
    const { parser: p, updates } = parseChunk(parser, chunk);
    parser = p;

    const meta = updates.find(u => u.type === 'meta') as any;
    expect(meta).toBeDefined();
    expect(meta.data.translations).toBeDefined();
    expect(meta.data.rating).toBeUndefined();
    expect(meta.data.difficulty).toBeUndefined();
    
    const complete = updates.find(u => u.type === 'complete') as any;
    expect(complete.data.rating).toBeUndefined();
    expect(complete.data.difficulty).toBeUndefined();
  });

  it('handles all optional key when present', () => {
    const config: ParserConfig = { 
      keys: ['rating', 'difficulty', 'translations', 'text'], 
      streamKeys: ['text'], 
      optionalKeys: ['rating', 'translations', 'difficulty'] 
    };
    let parser = createParser(config);

    const chunk = `rating: 8; difficulty: 2; translations: [{"word": "hablaremos", "translation": "we will talk (future tense of hablar)", "phonetic": "ah-blah-REH-mos", "audio": "<url>"}, {"word": "comida", "translation": "food (noun)", "phonetic": "koh-MEE-dah", "audio": "<url>"}]; text: Hello;`;
    const { parser: p, updates } = parseChunk(parser, chunk);
    parser = p;

    const meta = updates.find(u => u.type === 'meta') as any;
    expect(meta).toBeDefined();
    expect(meta.data.translations).toBeDefined();
    expect(meta.data.rating).toBe(8);
    expect(meta.data.difficulty).toBe(2);

    const complete = updates.find(u => u.type === 'complete') as any;
    expect(complete.data.rating).toBe(8);
  });
  
  it('does not complete update when input is malformed', () => {
    const config: ParserConfig = { 
      keys: ['rating', 'text'], 
      streamKeys: ['text'], 
      optionalKeys: [] 
    };
    let parser = createParser(config);

    const chunk = `rating: 7; text: Hello`;
    const { parser: p, updates } = parseChunk(parser, chunk);
    parser = p;

    const meta = updates.find(u => u.type === 'meta') as any;
    expect(meta.data.rating).toBe(7);

    const stream = updates.find(u => u.type === 'stream') as any;
    expect(stream.delta).toBe("Hello");
    
    const complete = updates.find(u => u.type === 'complete') as any;
    expect(complete).toBeUndefined();
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


// const tests = [
  //   'rating: 85; difficulty: 3; translations: [{"word": "hablaremos", "translation": "we will talk (future tense of hablar)", "phonetic": "ah-blah-REH-mos", "audio": "<url>"}, {"word": "comida", "translation": "food (noun)", "phonetic": "koh-MEE-dah", "audio": "<url>"}]; text: Hello;',

  //   "text: Hello;",

  //   'translations: [{"word": "hablaremos", "translation": "we will talk (future tense of hablar)", "phonetic": "ah-blah-REH-mos", "audio": "<url>"}, {"word": "comida", "translation": "food (noun)", "phonetic": "koh-MEE-dah", "audio": "<url>"}]; text: Hello;',

  //   "text: Hello"
  // ]

  // for (const [i, test] of tests.entries()) {
  //   const testResults = parseChunk(createParser(streamParserConfig), test);
  //   console.log(`TEST PARSE ${i+1}: `, testResults.updates);
  // }