/**
 * Modern Parser Combinator Library
 * A clean, efficient, and well-structured parsing system
 */

// Parser result types
class ParseResult {
  constructor(success, consumed = 0, value = null, error = null) {
    this.success = success;
    this.consumed = consumed;
    this.value = value;
    this.error = error;
  }

  static success(consumed, value) {
    return new ParseResult(true, consumed, value);
  }

  static failure(error = 'Parse failed', consumed = 0) {
    return new ParseResult(false, consumed, null, error);
  }
}

// Core parser types
const PARSER_TYPES = Object.freeze({
  RULE: 'rule',
  STRING: 'string',
  RANGE: 'range',
  SEQUENCE: 'sequence',
  CHOICE: 'choice',
  MACRO: 'macro'
});

class Parser {
  constructor(type, value, name = null) {
    this.type = type;
    this.value = value;
    this.name = name;
    this.postProcessor = null;
  }

  // Add post-processing function
  map(fn) {
    const newParser = Object.create(this);
    newParser.postProcessor = fn;
    return newParser;
  }
}

// Parser registry
class ParserRegistry {
  constructor() {
    this.rules = new Map();
    this.macros = new Map();
    this.initBuiltinMacros();
  }

  addRule(name, parser, postProcessor = null) {
    if (postProcessor) {
      parser = parser.map(postProcessor);
    }
    parser.name = name;
    this.rules.set(name, parser);
    return parser;
  }

  addMacro(name, fn) {
    this.macros.set(name, fn);
  }

  getRule(name) {
    const rule = this.rules.get(name);
    if (!rule) {
      throw new Error(`Rule '${name}' not found`);
    }
    return rule;
  }

  getMacro(name) {
    const macro = this.macros.get(name);
    if (!macro) {
      throw new Error(`Macro '${name}' not found`);
    }
    return macro;
  }

  initBuiltinMacros() {
    // Optional parser
    this.addMacro('optional', (parser) => {
      return new Parser(PARSER_TYPES.MACRO, (input, pos) => {
        const result = this.parse(parser, input, pos);
        if (result.success) {
          return result;
        }
        return ParseResult.success(0, null);
      });
    });

    // Zero or more repetitions
    this.addMacro('zeroOrMore', (parser) => {
      return new Parser(PARSER_TYPES.MACRO, (input, pos) => {
        const results = [];
        let currentPos = pos;
        
        while (currentPos < input.length) {
          const result = this.parse(parser, input, currentPos);
          if (!result.success) break;
          
          if (result.consumed === 0) break; // Prevent infinite loops
          
          results.push(result.value);
          currentPos += result.consumed;
        }
        
        return ParseResult.success(currentPos - pos, results);
      });
    });

    // One or more repetitions
    this.addMacro('oneOrMore', (parser) => {
      return new Parser(PARSER_TYPES.MACRO, (input, pos) => {
        const first = this.parse(parser, input, pos);
        if (!first.success) {
          return ParseResult.failure('Expected at least one match');
        }
        
        const rest = this.parse(this.getMacro('zeroOrMore')(parser), input, pos + first.consumed);
        const allResults = [first.value, ...rest.value];
        
        return ParseResult.success(first.consumed + rest.consumed, allResults);
      });
    });

    // Parse until a condition is met
    this.addMacro('until', (stopParser) => {
      return new Parser(PARSER_TYPES.MACRO, (input, pos) => {
        const result = [];
        let currentPos = pos;
        let escaped = false;
        
        while (currentPos < input.length) {
          // Handle escape sequences
          if (input[currentPos] === '\\' && !escaped) {
            escaped = true;
            currentPos++;
            continue;
          }
          
          // Check stop condition (only if not escaped)
          if (!escaped) {
            const stopResult = this.parse(stopParser, input, currentPos);
            if (stopResult.success) {
              result.push(stopResult);
              return ParseResult.success(currentPos - pos + stopResult.consumed, {result, stop: stopResult});
            }
          }
          
          result.push(input[currentPos]);
          currentPos++;
          escaped = false;
        }
        
        return ParseResult.failure('End of input reached without finding stop condition');
      });
    });

    // Whitespace parser
    this.addMacro('whitespace', () => {
      return new Parser(PARSER_TYPES.MACRO, (input, pos) => {
        let currentPos = pos;
        while (currentPos < input.length && /\s/.test(input[currentPos])) {
          currentPos++;
        }
        return ParseResult.success(currentPos - pos, input.slice(pos, currentPos));
      });
    });
  }

  parse(parser, input, pos = 0) {
    if (pos >= input.length && parser.type !== PARSER_TYPES.MACRO) {
      return ParseResult.failure('Unexpected end of input');
    }

    let result;

    switch (parser.type) {
      case PARSER_TYPES.RULE:
        const rule = this.getRule(parser.value);
        result = this.parse(rule, input, pos);
        break;

      case PARSER_TYPES.STRING:
        result = this.parseString(parser.value, input, pos);
        break;

      case PARSER_TYPES.RANGE:
        result = this.parseRange(parser.value, input, pos);
        break;

      case PARSER_TYPES.SEQUENCE:
        result = this.parseSequence(parser.value, input, pos);
        break;

      case PARSER_TYPES.CHOICE:
        result = this.parseChoice(parser.value, input, pos);
        break;

      case PARSER_TYPES.MACRO:
        result = parser.value(input, pos);
        break;

      default:
        result = ParseResult.failure(`Unknown parser type: ${parser.type}`);
    }

    // Apply post-processing if available
    if (result.success && parser.postProcessor) {
      try {
        result.value = parser.postProcessor(result.value);
      } catch (error) {
        return ParseResult.failure(`Post-processing error: ${error.message}`);
      }
    }

    return result;
  }

  parseString(str, input, pos) {
    if (pos + str.length > input.length) {
      return ParseResult.failure(`Expected "${str}" but reached end of input`);
    }

    const slice = input.slice(pos, pos + str.length);
    if (slice === str) {
      return ParseResult.success(str.length, str);
    }
    
    return ParseResult.failure(`Expected "${str}" but found "${slice}"`);
  }

  parseRange(range, input, pos) {
    if (pos >= input.length) {
      return ParseResult.failure('Unexpected end of input');
    }

    const char = input[pos];
    const charCode = char.charCodeAt(0);
    const [start, end] = range;
    const startCode = start.charCodeAt(0);
    const endCode = end.charCodeAt(0);

    if (charCode >= startCode && charCode <= endCode) {
      return ParseResult.success(1, char);
    }

    return ParseResult.failure(`Expected character in range [${start}-${end}] but found "${char}"`);
  }

  parseSequence(parsers, input, pos) {
    const results = [];
    let currentPos = pos;

    for (const parser of parsers) {
      const result = this.parse(parser, input, currentPos);
      if (!result.success) {
        return result;
      }
      results.push(result.value);
      currentPos += result.consumed;
    }

    return ParseResult.success(currentPos - pos, results);
  }

  parseChoice(parsers, input, pos) {
    let bestResult = null;
    let bestConsumed = -1;

    for (const parser of parsers) {
      const result = this.parse(parser, input, pos);
      if (result.success && result.consumed > bestConsumed) {
        bestResult = result;
        bestConsumed = result.consumed;
      }
    }

    return bestResult || ParseResult.failure('No alternative matched');
  }
}

// Parser builder functions
const create = {
  rule: (name) => new Parser(PARSER_TYPES.RULE, name),
  
  string: (str) => {
    if (typeof str !== 'string') {
      throw new Error('String parser requires a string value');
    }
    return new Parser(PARSER_TYPES.STRING, str);
  },
  
  range: (start, end) => {
    if (typeof start !== 'string' || typeof end !== 'string' || 
        start.length !== 1 || end.length !== 1) {
      throw new Error('Range parser requires single character start and end');
    }
    return new Parser(PARSER_TYPES.RANGE, [start, end]);
  },
  
  sequence: (...parsers) => {
    if (parsers.length === 0) {
      throw new Error('Sequence requires at least one parser');
    }
    return new Parser(PARSER_TYPES.SEQUENCE, parsers);
  },
  
  choice: (...parsers) => {
    if (parsers.length === 0) {
      throw new Error('Choice requires at least one parser');
    }
    return new Parser(PARSER_TYPES.CHOICE, parsers);
  },
  
  macro: (name, ...args) => {
    return new Parser(PARSER_TYPES.MACRO, (input, pos) => {
      const registry = globalRegistry; // Access global registry
      const macroFn = registry.getMacro(name);
      const macroParser = macroFn(...args);
      return registry.parse(macroParser, input, pos);
    });
  }
};

// Global registry instance
const globalRegistry = new ParserRegistry();

// High-level API
const ParserAPI = {
  // High-level API
  rule: create.rule,
  string: create.string,
  range: create.range,
  seq: create.sequence,
  choice: create.choice,
  optional: (parser) => create.macro('optional', parser),
  zeroOrMore: (parser) => create.macro('zeroOrMore', parser),
  oneOrMore: (parser) => create.macro('oneOrMore', parser),
  until: (stopParser) => create.macro('until', stopParser),
  ws: () => create.macro('whitespace'),

  // Registry operations
  defineRule: (name, parser, postProcessor) => 
    globalRegistry.addRule(name, parser, postProcessor),
  
  defineMacro: (name, fn) => 
    globalRegistry.addMacro(name, fn),

  // Parse input
  parse: (parser, input) => {
    try {
      return globalRegistry.parse(parser, input, 0);
    } catch (error) {
      return ParseResult.failure(error.message);
    }
  },

  // Utility functions
  match: (parser, input) => {
    const result = ParserAPI.parse(parser, input);
    return result.success && result.consumed === input.length;
  }
};

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParserAPI;
}

// Example usage:
/*
const { rule, string, range, seq, choice, defineRule, parse } = ParserAPI;

// Define a simple grammar
defineRule('digit', range('0', '9'));
defineRule('letter', choice(range('a', 'z'), range('A', 'Z')));
defineRule('identifier', seq(
  choice(rule('letter'), string('_')),
  zeroOrMore(choice(rule('letter'), rule('digit'), string('_')))
));

// Parse some input
const result = parse(rule('identifier'), 'myVar123');
console.log(result.success); // true
console.log(result.value);   // parsed result
*/