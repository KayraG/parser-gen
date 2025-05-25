/**
 * Grammar Compiler - Converts language grammar definitions to JSON
 * Uses the improved parser combinator library
 */

const ParserAPI = require('./pargo'); // Import the improved parser library
const fs = require('fs').promises;
const path = require('path');

// AST node types for the grammar language
const AST_TYPES = Object.freeze({
  IDENTIFIER: 'identifier',
  STRING: 'string',
  RANGE: 'range',
  SEQUENCE: 'sequence',
  CHOICE: 'choice',
  MACRO: 'macro',
  RULE: 'rule'
});

// Helper function to create AST nodes
const createASTNode = (type, value, meta = {}) => ({
  type,
  value,
  ...meta
});

class GrammarCompiler {
  constructor() {
    this.parser = ParserAPI;
    this.setupGrammar();
  }

  setupGrammar() {
    const { rule, string, range, seq, choice, optional, zeroOrMore, oneOrMore, ws, until, defineRule } = this.parser;

    // Basic character classes
    defineRule('alpha', range('a', 'z'));
    defineRule('digit', range('0', '9'));
    defineRule('alphaUpper', range('A', 'Z'));
    defineRule('underscore', string('_'));

    // Identifier: starts with letter or underscore, followed by letters, digits, or underscores
    defineRule('identifier', 
      seq(
        choice(rule('alpha'), rule('alphaUpper'), rule('underscore')),
        zeroOrMore(choice(rule('alpha'), rule('alphaUpper'), rule('digit'), rule('underscore')))
      ),
      (parts) => createASTNode(AST_TYPES.IDENTIFIER, this.flattenToString(parts))
    );

    // String literal: "content" - using until macro to find closing quote
    defineRule('stringLiteral',
      seq(string('"'), until(string('"'))),
      (parts) => createASTNode(AST_TYPES.STRING, parts[1].join(''))
    );

    // Character range: "a"-"z"
    defineRule('charRange',
      seq(rule('stringLiteral'), optional(ws()), string('-'), optional(ws()), rule('stringLiteral')),
      (parts) => createASTNode(AST_TYPES.RANGE, [parts[0].value, parts[4].value])
    );

    // Grouped expression: (expression)
    defineRule('grouped',
      seq(string('('), optional(ws()), rule('expression'), optional(ws()), string(')')),
      (parts) => parts[2] // Return the inner expression
    );

    // Macro invocation: *macroName or *macroName(expression)
    defineRule('macroInvocation',
      seq(
        string('*'),
        rule('identifier'),
        optional(seq(string('('), optional(ws()), rule('expression'), optional(ws()), string(')')))
      ),
      (parts) => {
        const macroName = parts[1].value;
        const argument = parts[2] ? parts[2][2] : null;
        return createASTNode(AST_TYPES.MACRO, argument ? [macroName, argument] : macroName);
      }
    );

    // Primary expression (atomic units)
    defineRule('primary',
      choice(
        rule('macroInvocation'), // Put macro first to avoid conflicts
        rule('charRange'),       // Put range before stringLiteral to match longer patterns first
        rule('stringLiteral'),
        rule('grouped'),
        rule('identifier')
      )
    );

    // Sequence element with optional comma and whitespace
    defineRule('sequenceElement',
      seq(optional(ws()), rule('primary'), optional(ws())),
      (parts) => parts[1]
    );

    // Choice expression: primary | primary | ...
    defineRule('choiceExpression',
      seq(
        rule('sequenceElement'),
        oneOrMore(seq(optional(ws()), string('|'), optional(ws()), rule('sequenceElement')))
      ),
      (parts) => {
        const elements = [parts[0], ...parts[1].map(part => part[3])];
        return createASTNode(AST_TYPES.CHOICE, elements);
      }
    );

    // Sequence expression: primary, primary, ...
    defineRule('sequenceExpression',
      seq(
        rule('sequenceElement'),
        oneOrMore(seq(optional(string(',')), optional(ws()), rule('sequenceElement')))
      ),
      (parts) => {
        const elements = [parts[0], ...parts[1].map(part => part[2])];
        return createASTNode(AST_TYPES.SEQUENCE, elements);
      }
    );

    // Main expression handler - try choice first, then sequence, then single element
    defineRule('expression',
      choice(
        rule('choiceExpression'),
        rule('sequenceExpression'),
        rule('sequenceElement')
      )
    );

    // Post-processor specification: {processorName}
    defineRule('postProcessor',
      seq(string('{'), optional(ws()), rule('identifier'), optional(ws()), string('}')),
      (parts) => parts[2].value
    );

    // Rule definition: ruleName: expression {postProcessor}?
    defineRule('ruleDefinition',
      seq(
        optional(ws()),
        rule('identifier'),
        optional(ws()),
        string(':'),
        optional(ws()),
        rule('expression'),
        optional(ws()),
        optional(rule('postProcessor')),
        optional(ws())
      ),
      (parts) => createASTNode(AST_TYPES.RULE, {
        name: parts[1].value,
        expression: parts[5],
        postProcessor: parts[7] || null
      })
    );

    // Line ending - newline or end of file
    defineRule('lineEnd',
      choice(
        string('\n'),
        string('\r\n'),
        string('\r')
      )
    );

    // Complete grammar file - rules separated by newlines
    defineRule('grammarFile',
      seq(
        optional(ws()),
        optional(seq(
          rule('ruleDefinition'),
          zeroOrMore(seq(
            oneOrMore(rule('lineEnd')),
            optional(rule('ruleDefinition'))
          ))
        )),
        optional(ws())
      ),
      (parts) => {
        if (!parts[1]) return []; // Empty file
        
        const rules = [parts[1][0]]; // First rule
        
        // Add remaining rules
        parts[1][1].forEach(part => {
          if (part[1]) { // Only add if rule exists (handle trailing newlines)
            rules.push(part[1]);
          }
        });
        
        return rules.filter(rule => rule !== null);
      }
    );
  }

  // Helper method to flatten nested arrays into a string
  flattenToString(arr) {
    if (typeof arr === 'string') return arr;
    if (Array.isArray(arr)) {
      return arr.map(item => this.flattenToString(item)).join('');
    }
    return String(arr);
  }

  // Compile grammar text to AST
  compile(grammarText) {
    try {
      // Add some debugging
      console.log('Input text:', JSON.stringify(grammarText.slice(0, 100) + '...'));
      
      const result = this.parser.parse(this.parser.rule('grammarFile'), grammarText);
      
      console.log('Parse result:', {
        success: result.success,
        consumed: result.consumed,
        totalLength: grammarText.length,
        error: result.error
      });
      
      if (!result.success) {
        throw new Error(`Parse error: ${result.error}`);
      }

      if (result.consumed !== grammarText.length) {
        const remaining = grammarText.slice(result.consumed);
        const consumedText = grammarText.slice(0, result.consumed);
        const line = consumedText.split('\n').length;
        const lastLine = consumedText.split('\n').pop();
        
        console.log('Debug info:');
        console.log('- Consumed:', result.consumed, 'of', grammarText.length);
        console.log('- Last parsed line:', JSON.stringify(lastLine));
        console.log('- Remaining text:', JSON.stringify(remaining.slice(0, 50)));
        
        throw new Error(`Incomplete parse at line ${line}. Remaining: "${remaining.slice(0, 20)}..."`);
      }

      return {
        success: true,
        ast: result.value,
        rules: this.extractRules(result.value)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        ast: null,
        rules: null
      };
    }
  }

  // Extract rules into a more usable format
  extractRules(ast) {
    const rules = new Map();
    
    for (const node of ast) {
      if (node.type === AST_TYPES.RULE) {
        rules.set(node.value.name, {
          name: node.value.name,
          expression: node.value.expression,
          postProcessor: node.value.postProcessor,
          dependencies: this.findDependencies(node.value.expression)
        });
      }
    }

    return Array.from(rules.values());
  }

  // Find rule dependencies for dependency analysis
  findDependencies(expression, deps = new Set()) {
    if (!expression) return Array.from(deps);

    switch (expression.type) {
      case AST_TYPES.IDENTIFIER:
        // This might be a rule reference
        deps.add(expression.value);
        break;
      
      case AST_TYPES.SEQUENCE:
      case AST_TYPES.CHOICE:
        if (Array.isArray(expression.value)) {
          expression.value.forEach(item => this.findDependencies(item, deps));
        }
        break;
      
      case AST_TYPES.MACRO:
        if (Array.isArray(expression.value)) {
          this.findDependencies(expression.value[1], deps);
        }
        break;
    }

    return Array.from(deps);
  }

  // Validate the grammar for common issues
  validateGrammar(rules) {
    const errors = [];
    const ruleNames = new Set(rules.map(r => r.name));

    for (const rule of rules) {
      // Check for undefined rule references
      for (const dep of rule.dependencies) {
        if (!ruleNames.has(dep) && !this.isBuiltinRule(dep)) {
          errors.push(`Rule '${rule.name}' references undefined rule '${dep}'`);
        }
      }

      // Check for direct left recursion
      if (this.hasDirectLeftRecursion(rule)) {
        errors.push(`Rule '${rule.name}' has direct left recursion`);
      }
    }

    return errors;
  }

  // Check if a rule name is a built-in rule
  isBuiltinRule(name) {
    const builtins = ['alpha', 'digit', 'alphaUpper'];
    return builtins.includes(name);
  }

  // Simple check for direct left recursion
  hasDirectLeftRecursion(rule) {
    const expr = rule.expression;
    if (expr.type === AST_TYPES.SEQUENCE && Array.isArray(expr.value)) {
      const first = expr.value[0];
      return first.type === AST_TYPES.IDENTIFIER && first.value === rule.name;
    }
    return false;
  }

  // Convert AST to JSON format
  toJSON(ast, pretty = true) {
    const jsonData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      rules: ast
    };

    return pretty ? JSON.stringify(jsonData, null, 2) : JSON.stringify(jsonData);
  }
}

// Main execution function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node compiler.js <grammar-file> [output-file]');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputFile = args[1] || inputFile.replace(/\.[^.]*$/, '.json');

  try {
    console.log(`Compiling grammar file: ${inputFile}`);
    
    // Read input file
    const grammarText = await fs.readFile(inputFile, 'utf8');
    
    // Compile grammar
    const compiler = new GrammarCompiler();
    const result = compiler.compile(grammarText);
    
    if (!result.success) {
      console.error(`Compilation failed: ${result.error}`);
      process.exit(1);
    }

    // Validate grammar
    const validationErrors = compiler.validateGrammar(result.rules);
    if (validationErrors.length > 0) {
      console.warn('Grammar validation warnings:');
      validationErrors.forEach(error => console.warn(`  - ${error}`));
    }

    // Generate output
    const jsonOutput = compiler.toJSON(result.rules);
    
    // Write output file
    await fs.writeFile(outputFile, jsonOutput, 'utf8');
    
    console.log(`Successfully compiled to: ${outputFile}`);
    console.log(`Generated ${result.rules.length} rules`);
    
    // Print summary
    if (result.rules.length > 0) {
      console.log('\nRules generated:');
      result.rules.forEach(rule => {
        const deps = rule.dependencies.length > 0 ? ` (depends on: ${rule.dependencies.join(', ')})` : '';
        console.log(`  - ${rule.name}${deps}`);
      });
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Export for testing or programmatic use
module.exports = {
  GrammarCompiler,
  AST_TYPES,
  createASTNode
};

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  });
}

/* Example grammar file format:

identifier: alpha, *zeroOrMore(alpha | digit | "_")
stringLiteral: "\"", *until("\"")
number: *oneOrMore(digit) {parseInt}
expression: identifier | stringLiteral | number

Note: Each rule should be on its own line.
Sequences are separated by commas and/or whitespace.
Choices are separated by | symbols.
Macros start with * followed by the macro name.
Post-processors are specified in {braces} at the end of rules.

*/