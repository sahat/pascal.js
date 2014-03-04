var builtin = require('./builtin');
var Native = require('./native');
var NativeProcedure = require('./native_procedure');
var Symbol = require('./symbol');
var OPCODES = require('./opcodes');
var Node = require('./node');
var _ = require('underscore');
var SymbolLookup = require('./symbol_lookup');

var SymbolTable = function(parentSymbolTable) {
  this.symbols = {};
  this.types = {};
  this.parentSymbolTable = parentSymbolTable;
  this.native = parentSymbolTable ? parentSymbolTable.native : new Native();

  this.totalVariableSize = 0;
  this.totalParameterSize = 0;
  this.totalTypedConstantsSize = 0;

  this.addSymbol = function(name, nodeType, type, byReference) {
    var address = -1; // Indicates error.

    byReference = byReference || false;

    if (nodeType === Node.VAR) {
      address = OPCODES.MARK_SIZE + this.totalParameterSize + this.totalVariableSize;
      this.totalVariableSize += type.getTypeSize();
    } else if (nodeType === Node.CONST) {
    } else if (nodeType === Node.TYPED_CONST) {
      address = OPCODES.MARK_SIZE + this.totalParameterSize + this.totalVariableSize;
      this.totalVariableSize += type.getTypeSize();
    } else if (nodeType === Node.PARAMETER) {
      address = OPCODES.MARK_SIZE + this.totalParameterSize;
      this.totalParameterSize += byReference ? 1 : type.getTypeSize();
    }

    var symbol = new Symbol(name, type, address, byReference);
    this.symbols[name.toLowerCase()] = symbol;

    return symbol;
  },

    this.addType = function(name, type) {
      var symbol = new Symbol(name, type, 0, false);
      this.types[name.toLowerCase()] = symbol;

      return symbol;
    },

    this.getSymbol = function(token, nodeType, level) {
      var name = token.tokenValue.toLowerCase();

      // Default to zero.
      level = level || 0;

      if (this.symbols.hasOwnProperty(name)) {
        var symbol = this.symbols[name];

        // Match optional nodeType.
        if (!nodeType || symbol.type.nodeType === nodeType) {
          return new SymbolLookup(symbol, level);
        }
      }

      if (this.parentSymbolTable !== null) {
        return this.parentSymbolTable.getSymbol(token, nodeType, level + 1);
      }

      throw new PascalError(token, "can't find symbol");
    },

    this.getType = function(token, level) {
      var name = token.tokenValue.toLowerCase();

      // Default to zero.
      level = level || 0;

      if (this.types.hasOwnProperty(name)) {
        var symbol = this.types[name];
        return new SymbolLookup(symbol, level);
      }

      if (this.parentSymbolTable !== null) {
        return this.parentSymbolTable.getType(token, level + 1);
      }

      throw new PascalError(token, "unknown type");
    },

    this.addNativeConstant = function(name, value, type) {
      var valueNode;
      switch (type.getSimpleTypeCode()) {
        case OPCODES.A:
          valueNode = Node.makePointerNode(value);
          break;
        case OPCODES.B:
          valueNode = Node.makeBooleanNode(value);
          break;
        default:
          valueNode = Node.makeNumberNode(value);
          break;
      }
      valueNode.expressionType = type;

      var symbol = this.addSymbol(name, Node.CONST, type);
      symbol.value = valueNode;
    },

    this.addNativeFunction = function(name, returnType, parameterTypes, fn) {
      // Add to table of builtins first (for CSP call).
      var nativeProcedure = new NativeProcedure(name, returnType, parameterTypes, fn);
      var index = this.native.add(nativeProcedure);

      // Function that takes a type and an index and returns a PARAMETER for it.
      var makeParameter = function(type, index) {
        var name = Node.makeIdentifierNode(String.fromCharCode(97 + index)); // "a", "b", ...
        return new Node(Node.PARAMETER, null, {
          name: name,
          type: type
        });
      };

      // Make function type.
      var type = new Node(Node.SUBPROGRAM_TYPE, null, {
        parameters: _.map(parameterTypes, makeParameter),
        returnType: returnType
      });

      // Add to this symbol table.
      var symbol = this.addSymbol(name, Node.SUBPROGRAM_TYPE, type);

      // Remember the native index.
      symbol.address = index;

      // Mark it as native.
      symbol.isNative = true;

      return symbol;
    },

    this.addNativeType = function(name, type) {
      // Nothing special here, it's just like a user-defined type.
      this.addType(name, type);
    }
};

SymbolTable.makeBuiltinSymbolTable = function () {
  var symbolTable = new SymbolTable(null);
  builtin.importSymbols(symbolTable);

  return symbolTable;
};

module.exports = SymbolTable;