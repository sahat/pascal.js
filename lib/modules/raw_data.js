var RawData = function () {
  this.length = 0;
  this.data = [];
  this.simpleTypeCodes = [];

  this.add = function (datum, simpleTypeCode) {
    this.length++;
    this.data.push(datum);
    this.simpleTypeCodes.push(simpleTypeCode);
  };

  this.addNode = function (node) {
    this.add(node.getConstantValue(), node.expressionType.getSimpleTypeCode());
  };

  this.print = function () {
    return "(" + this.data.join(", ") + ")";
  };
};

module.exports = RawData;