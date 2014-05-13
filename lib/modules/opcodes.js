var PascalError = require('./pascal_error');

var OPCODE_BITS = 8;
var OPERAND1_BITS = 9;
var OPERAND2_BITS = 15;
var OPCODE_MASK = (1 << OPCODE_BITS) - 1;
var OPERAND1_MASK = (1 << OPERAND1_BITS) - 1;
var OPERAND2_MASK = (1 << OPERAND2_BITS) - 1;
var OPCODE_SHIFT = 0;
var OPERAND1_SHIFT = OPCODE_SHIFT + OPCODE_BITS;
var OPERAND2_SHIFT = OPERAND1_SHIFT + OPERAND1_BITS;

var Opcodes = {
  CUP: 0,      // Call user procedure
  CSP: 1,      // Call standard procedure
  ENT: 2,      // Entry
  MST: 3,      // Mark stack
  RTN: 4,      // Return
  EQ: 5,      // Equality
  NEQ: 6,      // Inequality
  GT: 7,      // Greater than
  GTE: 8,      // Greater than or equal
  LT: 9,      // Less than
  LTE: 10,      // Less than or equal
  ADD: 11,      // Addition
  SUB: 12,      // Subtraction
  NEG: 13,      // Sign inversion
  MUL: 14,      // Multiplication
  DIV: 15,      // Division
  MOD: 16,      // Modulo
  ABS: 17,      // Absolute value
  SQR: 18,      // Square
  INC: 19,      // Increment
  DEC: 20,      // Decrement
  IOR: 21,      // Inclusive OR
  AND: 22,      // AND
  XOR: 23,      // Exclusive OR
  NOT: 24,      // NOT
  INN: 25,      // Set membership
  UNI: 26,      // Set union
  INT: 27,      // Set intersection
  DIF: 28,      // Set difference
  CMP: 29,      // Set complement
  SGS: 30,      // Generate singleton set
  UJP: 31,      // Unconditional jump
  XJP: 32,      // Indexed jump
  FJP: 33,      // False jump
  TJP: 34,      // True jump
  FLT: 35,      // Integer to real
  FLO: 36,      // Integer to real, second entry
  TRC: 37,      // Truncate
  RND: 38,      // Round
  CHR: 39,      // Integer to char
  ORD: 40,      // Anything to integer
  STP: 41,      // Stop
  LDA: 42,      // Load address of data
  LDC: 43,      // Load constant
  LDI: 44,      // Load indirect
  LVA: 45,      // Load value (address)
  LVB: 46,      // Load value (boolean)
  LVC: 47,      // Load value (character)
  LVI: 48,      // Load value (integer)
  LVR: 49,      // Load value (real)
  LVS: 50,      // Load value (set)
  STI: 51,      // Store indirect
  IXA: 52,      // Compute indexed address

  REG_SP: 0,   // Stack pointer
  REG_EP: 1,   // Extreme pointer
  REG_MP: 2,   // Mark pointer
  REG_PC: 3,   // Program counter
  REG_NP: 4,   // New pointer

  A: 0,        // Address
  B: 1,        // Boolean
  C: 2,        // Character
  I: 3,        // Integer
  R: 4,        // Real
  S: 5,        // String
  T: 6,        // Set
  P: 7,        // Procedure
  X: 8,        // Any

  MARK_SIZE: 5,

  make: function (opcode, operand1, operand2) {
    operand1 = operand1 || 0;
    operand2 = operand2 || 0;

    return (opcode << OPCODE_SHIFT) | (operand1 << OPERAND1_SHIFT) | (operand2 << OPERAND2_SHIFT);
  },

  getOpcode: function(i) {
    return (i >>> OPCODE_SHIFT) & OPCODE_MASK;
  },

  getOp1: function(i) {
    return (i >>> OPERAND1_SHIFT) & OPERAND1_MASK;
  },

  getOp2: function(i) {
    return (i >>> OPERAND2_SHIFT) & OPERAND2_MASK;
  },

  typeCodeToName: function (typeCode) {
    switch (typeCode) {
      case this.A:
        return 'pointer';
      case this.B:
        return 'boolean';
      case this.C:
        return 'char';
      case this.I:
        return 'integer';
      case this.R:
        return 'real';
      case this.S:
        return 'string';
      default:
        throw new PascalError(null, 'unknown type code ' + typeCode);
    }
  }
};

module.exports = Opcodes;
