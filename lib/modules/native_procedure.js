var NativeProcedure = function(name, returnType, parameterTypes, fn) {
  this.name = name;
  this.returnType = returnType;
  this.fn = fn;
};

module.exports = NativeProcedure;