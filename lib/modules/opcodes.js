var PascalError = require('./../pascal_error');

var OPCODE_BITS = 8;
var OPERAND1_BITS = 9;
var OPERAND2_BITS = 15;
var OPCODE_MASK = (1 << OPCODE_BITS) - 1;
var OPERAND1_MASK = (1 << OPERAND1_BITS) - 1;
var OPERAND2_MASK = (1 << OPERAND2_BITS) - 1;
var OPCODE_SHIFT = 0;
var OPERAND1_SHIFT = OPCODE_SHIFT + OPCODE_BITS;
var OPERAND2_SHIFT = OPERAND1_SHIFT + OPERAND1_BITS;

var OPCODES = {
  CUP: 0x00,      // Call user procedure
  CSP: 0x01,      // Call standard procedure
  ENT: 0x02,      // Entry
  MST: 0x03,      // Mark stack
  RTN: 0x04,      // Return
  EQU: 0x05,      // Equality
  NEQ: 0x06,      // Inequality
  GRT: 0x07,      // Greater than
  GEQ: 0x08,      // Greater than or equal
  LES: 0x09,      // Less than
  LEQ: 0x0A,      // Less than or equal
  ADI: 0x0B,      // Integer addition
  SBI: 0x0C,      // Integer subtraction
  NGI: 0x0D,      // Integer sign inversion
  MPI: 0x0E,      // Integer multiplication
  DVI: 0x0F,      // Integer division
  MOD: 0x10,      // Integer modulo
  ABI: 0x11,      // Integer absolute value
  SQI: 0x12,      // Integer square
  INC: 0x13,      // Integer increment
  DEC: 0x14,      // Integer decrement
  ADR: 0x15,      // Real addition
  SBR: 0x16,      // Real subtraction
  NGR: 0x17,      // Real sign inversion
  MPR: 0x18,      // Real multiplication
  DVR: 0x19,      // Real division
  ABR: 0x1A,      // Real absolute value
  SQR: 0x1B,      // Real square
  IOR: 0x1C,      // Inclusive OR
  AND: 0x1D,      // AN
  XOR: 0x1E,      // Exclusive OR
  NOT: 0x1F,      // NOT
  INN: 0x20,      // Set membership
  UNI: 0x21,      // Set union
  INT: 0x22,      // Set intersection
  DIF: 0x23,      // Set difference
  CMP: 0x24,      // Set complement
  SGS: 0x25,      // Generate singleton set
  UJP: 0x26,      // Unconditional jump
  XJP: 0x27,      // Indexed jump
  FJP: 0x28,      // False jump
  TJP: 0x29,      // True jump
  FLT: 0x2A,      // Integer to real
  FLO: 0x2B,      // Integer to real, second entry
  TRC: 0x2C,      // Truncate
  RND: 0x2C,      // Round
  CHR: 0x2C,      // Integer to char
  ORD: 0x2C,      // Anything to integer
  STP: 0x30,      // Stop
  LDA: 0x31,      // Load address of data
  LDC: 0x32,      // Load constant
  LDI: 0x33,      // Load indirect
  LVA: 0x34,      // Load value (address)
  LVB: 0x35,      // Load value (boolean)
  LVC: 0x36,      // Load value (character)
  LVI: 0x37,      // Load value (integer)
  LVR: 0x38,      // Load value (real)
  LVS: 0x39,      // Load value (set)
  STI: 0x3A,      // Store indirect
  IXA: 0x3B,      // Compute indexed address

  REG_SP: 0x00,   // Stack pointer
  REG_EP: 0x01,   // Extreme pointer
  REG_MP: 0x02,   // Mark pointer
  REG_PC: 0x03,   // Program counter
  REG_NP: 0x04,   // New pointer

  A: 0x00,        // Address
  B: 0x01,        // Boolean
  C: 0x02,        // Character
  I: 0x03,        // Integer
  R: 0x04,        // Real
  S: 0x05,        // String
  T: 0x06,        // Set
  P: 0x07,        // Procedure
  X: 0x08,        // Any

  MARK_SIZE: 5,

  opcodeToName: {},

  make: function (opcode, operand1, operand2) {
    operand1 = operand1 || 0;
    operand2 = operand2 || 0;

    if (operand1 < 0) {
      throw new PascalError(null, "negative operand1: " + operand1);
    }

    if (operand1 > OPERAND1_MASK) {
      throw new PascalError(null, "too large operand1: " + operand1);
    }

    if (operand2 < 0) {
      throw new PascalError(null, "negative operand2: " + operand2);
    }

    if (operand2 > OPERAND2_MASK) {
      throw new PascalError(null, "too large operand2: " + operand2);
    }

    return (opcode << OPCODE_SHIFT) | (operand1 << OPERAND1_SHIFT) | (operand2 << OPERAND2_SHIFT);
  },

  getOpcode: function(i) {
    return (i >>> OPCODE_SHIFT) & OPCODE_MASK;
  },

  getOperand1: function(i) {
    return (i >>> OPERAND1_SHIFT) & OPERAND1_MASK;
  },

  getOperand2: function(i) {
    return (i >>> OPERAND2_SHIFT) & OPERAND2_MASK;
  },

  disassemble: function (i) {
    var opcode = this.getOpcode(i);
    var operand1 = this.getOperand1(i);
    var operand2 = this.getOperand2(i);
    return this.opcodeToName[opcode] + " " + operand1 + " " + operand2;
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

OPCODES.opcodeToName[OPCODES.CUP] = 'CUP';
OPCODES.opcodeToName[OPCODES.CSP] = 'CSP';
OPCODES.opcodeToName[OPCODES.ENT] = 'ENT';
OPCODES.opcodeToName[OPCODES.MST] = 'MST';
OPCODES.opcodeToName[OPCODES.RTN] = 'RTN';
OPCODES.opcodeToName[OPCODES.EQU] = 'EQU';
OPCODES.opcodeToName[OPCODES.NEQ] = 'NEQ';
OPCODES.opcodeToName[OPCODES.GRT] = 'GRT';
OPCODES.opcodeToName[OPCODES.GEQ] = 'GEQ';
OPCODES.opcodeToName[OPCODES.LES] = 'LES';
OPCODES.opcodeToName[OPCODES.LEQ] = 'LEQ';
OPCODES.opcodeToName[OPCODES.ADI] = 'ADI';
OPCODES.opcodeToName[OPCODES.SBI] = 'SBI';
OPCODES.opcodeToName[OPCODES.NGI] = 'NGI';
OPCODES.opcodeToName[OPCODES.MPI] = 'MPI';
OPCODES.opcodeToName[OPCODES.DVI] = 'DVI';
OPCODES.opcodeToName[OPCODES.MOD] = 'MOD';
OPCODES.opcodeToName[OPCODES.ABI] = 'ABI';
OPCODES.opcodeToName[OPCODES.SQI] = 'SQI';
OPCODES.opcodeToName[OPCODES.INC] = 'INC';
OPCODES.opcodeToName[OPCODES.DEC] = 'DEC';
OPCODES.opcodeToName[OPCODES.ADR] = 'ADR';
OPCODES.opcodeToName[OPCODES.SBR] = 'SBR';
OPCODES.opcodeToName[OPCODES.NGR] = 'NGR';
OPCODES.opcodeToName[OPCODES.MPR] = 'MPR';
OPCODES.opcodeToName[OPCODES.DVR] = 'DVR';
OPCODES.opcodeToName[OPCODES.ABR] = 'ABR';
OPCODES.opcodeToName[OPCODES.SQR] = 'SQR';
OPCODES.opcodeToName[OPCODES.IOR] = 'IOR';
OPCODES.opcodeToName[OPCODES.AND] = 'AND';
OPCODES.opcodeToName[OPCODES.XOR] = 'XOR';
OPCODES.opcodeToName[OPCODES.NOT] = 'NOT';
OPCODES.opcodeToName[OPCODES.INN] = 'INN';
OPCODES.opcodeToName[OPCODES.UNI] = 'UNI';
OPCODES.opcodeToName[OPCODES.INT] = 'INT';
OPCODES.opcodeToName[OPCODES.DIF] = 'DIF';
OPCODES.opcodeToName[OPCODES.CMP] = 'CMP';
OPCODES.opcodeToName[OPCODES.SGS] = 'SGS';
OPCODES.opcodeToName[OPCODES.UJP] = 'UJP';
OPCODES.opcodeToName[OPCODES.XJP] = 'XJP';
OPCODES.opcodeToName[OPCODES.FJP] = 'FJP';
OPCODES.opcodeToName[OPCODES.TJP] = 'TJP';
OPCODES.opcodeToName[OPCODES.FLT] = 'FLT';
OPCODES.opcodeToName[OPCODES.FLO] = 'FLO';
OPCODES.opcodeToName[OPCODES.TRC] = 'TRC';
OPCODES.opcodeToName[OPCODES.RND] = 'RND';
OPCODES.opcodeToName[OPCODES.CHR] = 'CHR';
OPCODES.opcodeToName[OPCODES.ORD] = 'ORD';
OPCODES.opcodeToName[OPCODES.STP] = 'STP';
OPCODES.opcodeToName[OPCODES.LDA] = 'LDA';
OPCODES.opcodeToName[OPCODES.LDC] = 'LDC';
OPCODES.opcodeToName[OPCODES.LDI] = 'LDI';
OPCODES.opcodeToName[OPCODES.LVA] = 'LVA';
OPCODES.opcodeToName[OPCODES.LVB] = 'LVB';
OPCODES.opcodeToName[OPCODES.LVC] = 'LVC';
OPCODES.opcodeToName[OPCODES.LVI] = 'LVI';
OPCODES.opcodeToName[OPCODES.LVR] = 'LVR';
OPCODES.opcodeToName[OPCODES.LVS] = 'LVS';
OPCODES.opcodeToName[OPCODES.STI] = 'STI';
OPCODES.opcodeToName[OPCODES.IXA] = 'IXA';

module.exports = OPCODES;
