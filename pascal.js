/**
 * PascalJS
 * @version 0.1
 * @author Sahat Yalkabov
 * @license MIT
 */
var _ = require('underscore');
var fs = require('fs');
var PascalError = require('./pascal_error');
var Token = require('./token');
var Bytecode = require('./bytecode');
var Scanner = require('./scanner');
var Stream = require('./stream');
var Symbol = require('./symbol');
var Node = require('./node');
var CommentStripper = require('./comment_stripper');
var RawData = require('./raw_data');
var OPCODES = require('./opcodes');
var NativeProcedure = require('./native_procedure');
var Native = require('./native');
var SymbolLookup = require('./symbol_lookup')
var SymbolTable = require('./symbol_table');
var Compiler = require('./compiler');
var Machine = require('./machine');
var Parser = require('./parser');

var contents = fs.readFileSync('./examples/hello.pas', 'utf8');
var DUMP_TREE = true;
var DUMP_BYTECODE = true;
var DEBUG_TRACE = true;

var stream = new Stream(contents);
var scanner = new CommentStripper(new Scanner(stream));
var parser = new Parser(scanner);

try {
  // Create the symbol table of built-in constants, functions, and procedures.
  var builtinSymbolTable = SymbolTable.makeBuiltinSymbolTable();

  // Parse the program into a parse tree. Create the symbol table as we go.
  var before = new Date().getTime();
  var root = parser.parse(builtinSymbolTable);
  /// console.log("Parsing: " + (new Date().getTime() - before) + "ms");
  if (DUMP_TREE) {
    var output = root.print("");
    console.log(output);
  }

  // Compile to bytecode.
  before = new Date().getTime();
  var compiler = new Compiler();
  var bytecode = compiler.compile(root);
  /// console.log("Code generation: " + (new Date().getTime() - before) + "ms");
  if (DUMP_BYTECODE) {
    var output = bytecode.print();
    console.log(output);
  }

  // Execute the bytecode.
  var machine = new Machine(bytecode, this.keyboard);
  if (DEBUG_TRACE) {
    machine.setDebugCallback(function (state) {
      console.log(state);
    });
  }
  machine.setFinishCallback(function (runningTime) {
    console.log("Finished program: " + runningTime + "s");
  });
  machine.setOutputCallback(function (line) {
    console.log(line);
  });

  machine.run();
} catch (e) {
  // Print parsing errors.
  if (e instanceof PascalError) {
    console.error(e.getMessage());
  }
  console.log(e.stack);
}

