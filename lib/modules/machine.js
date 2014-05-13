var PascalError = require('./pascal_error');
var utils = require('./utils');
var opcodes = require('./opcodes');

var Machine = function(bytecode) {
  this.bytecode = bytecode;
  this.dataStore = [];
  this.programCounter = 0;
  this.stackPointer = 0;
  this.markPointer = 0;
  this.newPointer = 0;
  this.state = Machine.STOPPED;

  this.pendingDelay = 0;

  // Control object for native functions to manipulate this machine.
  var self = this;
  this.control = {
    stop: function() {
      self.stopProgram();
    },
    delay: function(ms) {
      self.pendingDelay = ms;
    },
    writeln: function(line) {
      if (self.outputCallback !== null) {
        self.outputCallback(line);
      }
    },
    readDstore: function(address) {
      return self.dataStore[address];
    },
    writeDstore: function(address, value) {
      self.dataStore[address] = value;
    },
    malloc: function(size) {
      return self._malloc(size);
    },
    free: function(p) {
      return self._free(p);
    }
  };
};

Machine.STOPPED = 0;
Machine.RUNNING = 1;

Machine.prototype.run = function() {
  this.resetMachine();

  this.state = Machine.RUNNING;

  this.step(100000);
};

Machine.prototype.step = function(count) {
  for (var i = 0; i < count && this.state === Machine.RUNNING &&
    this.pendingDelay === 0; i++) {
    this._executeInstruction();
  }
};


Machine.prototype.setOutputCallback = function(outputCallback) {
  this.outputCallback = outputCallback;
};


// Generate a string which is a human-readable version of the machine state.
Machine.prototype._getState = function() {
  // Clip off stack display since it can be very large with arrays.
  var maxStack = 20;
  // Skip typed constants.
  var startStack = this.bytecode.typedConstants.length;
  var clipStack = Math.max(startStack, this.stackPointer - maxStack);
  var stack = JSON.stringify(this.dataStore.slice(clipStack, this.stackPointer));
  if (clipStack > startStack) {
    // Trim stack.
    stack = stack[0] + "...," + stack.slice(1, stack.length);
  }

  // Clip off heap display since it can be very large with arrays.
  var maxHeap = 20;
  var heapSize = this.dataStore.length - this.newPointer;
  var heapDisplay = Math.min(maxHeap, heapSize);
  var heap = JSON.stringify(this.dataStore.slice(
      this.dataStore.length - heapDisplay, this.dataStore.length));
  if (heapDisplay != heapSize) {
    // Trim heap.
    heap = heap[0] + "...," + heap.slice(1, heap.length);
  }

  var state = [
      "pc = " + utils.rightAlign(this.programCounter, 4),
    /// "sp = " + utils.rightAlign(this.sp, 3),
      "mp = " + utils.rightAlign(this.markPointer, 3),
      "stack = " + utils.leftAlign(stack, 40),
      "heap = " + heap
  ];

  return state.join(" ");
}

// Push a value onto the stack.
Machine.prototype.push = function(value) {
  // Sanity check.
  if (value === null || value === undefined) {
    throw new PascalError(null, "can't push " + value);
  }
  this.dataStore[this.stackPointer++] = value;
};

// Pop a value off the stack.
Machine.prototype.pop = function() {
  --this.stackPointer;
  var value = this.dataStore[this.stackPointer];

  // Set it to undefined so we can find bugs more easily.
  this.dataStore[this.stackPointer] = undefined;

  return value;
};

Machine.prototype.resetMachine = function() {
  for (var i = 0; i < this.bytecode.typedConstants.length; i++) {
    this.dataStore[i] = this.bytecode.typedConstants[i];
  }
  this.programCounter = this.bytecode.startAddress;
  this.stackPointer = this.bytecode.typedConstants.length;
  this.markPointer = 0;
  this.newPointer = this.dataStore.length;
  this.state = Machine.STOPPED;
};

Machine.prototype._getStaticLink = function(mp) {
  return this.dataStore[mp + 1];
};

Machine.prototype._checkDataAddress = function(address) {
  if (address >= this.stackPointer && address < this.newPointer) {
    throw new PascalError(null, "invalid data address (" +
      this.stackPointer + " <= " + address + " < " + this.newPointer + ")");
  }
};

Machine.prototype.stopProgram = function() {
  if (this.state !== Machine.STOPPED) {
    this.state = Machine.STOPPED;
  }
};

Machine.prototype._executeInstruction = function() {
  // Get this instruction.
  var pc = this.programCounter;
  var i = this.bytecode.istore[pc];

  // Advance the PC right away. Various instructions can then modify it.
  this.programCounter++;

  var opcode = opcodes.getOpcode(i);
  var op1 = opcodes.getOp1(i);
  var op2 = opcodes.getOp2(i);

  switch (opcode) {
    case opcodes.CUP:
      // Call User Procedure. By now SP already points past the mark
      // and the parameters. So we set the new MP by backing off all
      // those. Opcode1 is the number of parameters passed in.
      this.markPointer = this.stackPointer - op1 - opcodes.MARK_SIZE;

      // Store the return address.
      this.dataStore[this.markPointer + 4] = this.programCounter;

      // Jump to the procedure.
      this.programCounter = op2;
      break;
    case opcodes.CSP:
      // Call System Procedure. We look up the index into the Native object
      // and call it.
      var nativeProcedure = this.bytecode.native.get(op2);

      // Pop parameters.
      var parameters = [];
      for (var i = 0; i < op1; i++) {
        // They are pushed on the stack first to last, so we
        // unshift them (push them on the front) so they end up in
        // the right order.
        parameters.unshift(this.pop());
      }

      // Push the control object that the native function can use to
      // control this machine.
      parameters.unshift(this.control);

      var returnValue = nativeProcedure.fn.apply(null, parameters);

      // Push result if we're a function.
      if (!nativeProcedure.returnType.isSimpleType(opcodes.P)) {
        this.push(returnValue);
      }
      break;
    case opcodes.ENT:
      // Entry. Set SP or EP to MP + op2, which is the sum of
      // the mark size, the parameters, and all local variables. If
      // we're setting SP, then we're making room for local variables
      // and preparing the SP to do computation.
      var address = this.markPointer + op2;
        // Clear the local variable area.
      for (var i = this.stackPointer; i < address; i++) {
        this.dataStore[i] = 0;
        }
      this.stackPointer = address;

      break;
    case opcodes.MST:
      // Follow static links "op1" times.
      var sl = this.markPointer;
      for (var i = 0; i < op1; i++) {
        sl = this._getStaticLink(sl);
      }

      // Mark Stack.
      this.push(0);              // RV, set by called function.
      this.push(sl);             // SL
      this.push(this.markPointer);        // DL
      this.push(0);              // RA, set by CUP.
      break;
    case opcodes.RTN:
      // Return.
      var oldMp = this.markPointer;
      this.markPointer = this.dataStore[oldMp + 2];
      this.programCounter = this.dataStore[oldMp + 4];
      if (op1 === opcodes.P) {
        // Procedure, pop off the return value.
        this.stackPointer = oldMp;
      } else {
        // Function, leave the return value on the stack.
        this.stackPointer = oldMp + 1;
      }
      break;
    case opcodes.EQ:
      // Equal To.
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 === op2);
      break;
    case opcodes.NEQ:
      // Not Equal To.
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 !== op2);
      break;
    case opcodes.GT:
      // Greater Than.
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 > op2);
      break;
    case opcodes.GTE:
      // Greater Than Or Equal To.
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 >= op2);
      break;
    case opcodes.LT:
      // Less Than.
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 < op2);
      break;
    case opcodes.LTE:
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 <= op2);
      break;
    case opcodes.ADD:
    case opcodes.ADR:
      // Add integer/real.
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 + op2);
      break;
    case opcodes.SUB:
    case opcodes.SBR:
      // Subtract integer/real.
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 - op2);
      break;
    case opcodes.NEG:
    case opcodes.NGR:
      // Negate.
      this.push(-this.pop());
      break;
    case opcodes.MUL:
    case opcodes.MPR:
      // Multiply integer/real.
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 * op2);
      break;
    case opcodes.DIV:
      // Divide integer.
      var op2 = this.pop();
      var op1 = this.pop();
      if (op2 === 0) {
        throw new PascalError(null, "divide by zero");
      }
      this.push(truncate(op1 / op2));
      break;
    case opcodes.MOD:
      // Modulo.
      var op2 = this.pop();
      var op1 = this.pop();
      if (op2 === 0) {
        throw new PascalError(null, "modulo by zero");
      }
      this.push(op1 % op2);
      break;
    // case defs.ABI:
    // case defs.SQI:
    case opcodes.INC:
      // Increment.
      this.push(this.pop() + 1);
      break;
    case opcodes.DEC:
      // Decrement.
      this.push(this.pop() - 1);
      break;
    case opcodes.DVR:
      // Divide real.
      var op2 = this.pop();
      var op1 = this.pop();
      if (op2 === 0) {
        throw new PascalError(null, "divide by zero");
      }
      this.push(op1 / op2);
      break;
    // case defs.ABR:
    // case defs.SQR:
    case opcodes.IOR:
      // Inclusive OR.
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 || op2);
      break;
    case opcodes.AND:
      // AND
      var op2 = this.pop();
      var op1 = this.pop();
      this.push(op1 && op2);
      break;
    // case defs.XOR:
    case opcodes.NOT:
      this.push(!this.pop());
      break;
    // case defs.INN:
    // case defs.UNI:
    // case defs.INT:
    // case defs.DIF:
    // case defs.CMP:
    // case defs.SGS:
    case opcodes.UJP:
      this.programCounter = op2;
      break;
    case opcodes.XJP:
      this.programCounter = this.pop();
      break;
    case opcodes.FJP:
      if (!this.pop()) {
        this.programCounter = op2;
      }
      break;
    case opcodes.TJP:
      if (this.pop()) {
        this.programCounter = op2;
      }
      break;
    case opcodes.FLT:
      // Cast Integer to Real.
      // Nothing to do, we don't distinguish between integers and real.
      break;
    // case defs.FLO:
    // case defs.TRC:
    // case defs.RND:
    // case defs.CHR:
    // case defs.ORD:
    case opcodes.STP:
      // Stop.
      this.stopProgram();
      break;
    case opcodes.LDA:
      // Load Address. Pushes the address of a variable.
      var address = this._computeAddress(op1, op2);
      this.push(address);
      break;
    case opcodes.LDC:
      // Load Constant.
      if (op1 === opcodes.I || op1 === opcodes.R ||
        op1 === opcodes.S || op1 === opcodes.A) {

        // Look up the constant in the constant pool.
        this.push(this.bytecode.constants[op2]);
      } else if (op1 === opcodes.B) {
        // Booleans are stored in op2.
        this.push(!!op2);
      } else if (op1 === opcodes.C) {
        // Characters are stored in op2.
        this.push(op2);
      } else {
        throw new PascalError(null, "can't push constant of type " +
          opcodes.typeCodeToName(op1));
      }
      break;
    case opcodes.LDI:
      // Load Indirect.
      var address = this.pop();
      this._checkDataAddress(address);
      this.push(this.dataStore[address]);
      break;
    case opcodes.LVA:
    case opcodes.LVB:
    case opcodes.LVC:
    case opcodes.LVI:
    case opcodes.LVR:
      // Load Value.
      var address = this._computeAddress(op1, op2);
      this._checkDataAddress(address);
      this.push(this.dataStore[address]);
      break;
    // case defs.LVS:
    case opcodes.STI:
      // Store Indirect.
      var value = this.pop();
      var address = this.pop();
      this._checkDataAddress(address);
      this.dataStore[address] = value;
      break;
    case opcodes.IXA:
      // Indexed Address. a = a + index*stride
      var address = this.pop();
      var index = this.pop();
      address += index * op2;
      this.push(address);
      break;
  }
};

// Given a level and an offset, returns the address in the dstore. The level is
// the number of static links to dereference.
Machine.prototype._computeAddress = function(level, offset) {
  var mp = this.markPointer;

  // Follow static link "level" times.
  for (var i = 0; i < level; i++) {
    mp = this._getStaticLink(mp);
  }

  return mp + offset;
};

// Allocate "size" words on the heap and return the new address. Throws if no
// more heap is available.
Machine.prototype._malloc = function(size) {
  // Make room for the object.
  this.newPointer -= size;
  var address = this.newPointer;

  // Blank out new allocation.
  for (var i = 0; i < size; i++) {
    this.dataStore[address + i] = 0;
  }

  // Store size of allocation one word before the object.
  this.newPointer--;
  this.dataStore[this.newPointer] = size;

  return address;
};

// Free the block on the heap pointed to by p.
Machine.prototype._free = function(p) {
  // Get the size. We wrote it in the word before p.
  var size = this.dataStore[p - 1];

  if (p === this.newPointer + 1) {
    // This block is at the bottom of the heap. Just reclaim the memory.
    this.newPointer += size + 1;
  } else {
    // Internal node. Not handled.
  }
};

module.exports = Machine;