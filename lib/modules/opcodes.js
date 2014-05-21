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
  CUP: 0,      // call user procedure
  CSP: 1,      // call standard procedure
  ENT: 2,      // entry
  MST: 3,      // mark stack
  RTN: 4,      // return
  EQ: 5,       // equality
  NEQ: 6,      // inequality
  GT: 7,       // greater than
  GTE: 8,      // greater than or equal
  LT: 9,       // less than
  LTE: 10,     // less than or equal
  ADD: 11,      // addition
  SUB: 12,      // subtraction
  NEG: 13,      // sign inversion
  MUL: 14,      // multiplication
  DIV: 15,      // division
  MOD: 16,      // modulo
  ABS: 17,      // absolute value
  INC: 19,      // increment
  DEC: 20,      // decrement
  OR: 21,       // or
  AND: 22,      // and
  NOT: 23,      // not
  UJP: 24,      // unconditional jump
  XJP: 25,      // indexed jump
  FJP: 26,      // false jump
  TJP: 27,      // true jump
  STP: 28,      // stop
  LDA: 29,      // load address of data
  LDC: 30,      // load constant
  LDI: 31,      // load indirect
  LVB: 32,      // load value (boolean)
  LVC: 33,      // load value (character)
  LVI: 34,      // load value (integer)
  LVR: 35,      // load value (real)
  LVS: 36,      // load value (set)
  STI: 37,      // store indirect
  IXA: 38,      // compute indexed address

  REG_SP: 0,   // stack pointer
  REG_EP: 1,   // extreme pointer
  REG_MP: 2,   // mark pointer
  REG_PC: 3,   // program counter
  REG_NP: 4,   // new pointer

  A: 0,        // address
  B: 1,        // boolean
  C: 2,        // character
  I: 3,        // integer
  S: 4,        // string
  P: 5,        // procedure
  X: 6,        // any

  MARK_SIZE: 5,

  make: function(opcode, operand1, operand2) {
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
  }
};

module.exports = Opcodes;
