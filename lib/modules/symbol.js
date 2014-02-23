var Symbol = function(name, type, address, byReference) {
  this.name = name;
  this.type = type;
  this.address = address;
  this.isNative = false;
  this.value = null;
  this.byReference = byReference;
};

module.exports = Symbol;
