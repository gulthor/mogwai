var _ = require("underscore"),
    Model = require("./model"),
    __extends = require("./extends"),
    GroovyParser = require("./groovy/groovyparser");

module.exports = ModelCompiler = (function() {
  function ModelCompiler(base) {
    this.base = base;
    this.groovyParser = new GroovyParser();
  }

  /**
   * Dynamically build an instantiable Model class from a Schema
   *
   * @inspiredBy: https://github.com/LearnBoost/mongoose/blob/a04860f30f03c44029ea64ec2b08e723e6baf899/lib/model.js#L2454
   *
   * @param {String} name - name of the model
   * @param {Schema} schema - Schema defining the model
   * @param {String} groovyFileContent - Content of a Groovy file
   * @return {Function} - Model constructor
   */
  ModelCompiler.prototype.compile = function(name, schema, groovyFileContent) {
    var self = this;

    model = (function (_super) {
      // Inherit from Model
      __extends(model, _super);

      function model() {
        return model.__super__.constructor.apply(this, arguments);
      }

      return model;

    })(Model);

    model.prototype.base = model.base = self.base;
    model.prototype.connection = model.connection = self.base.connection; //todo: replace by a getter?

    // Define a special $type key used to identify vertices by type in the graph.
    // Note that this special "Mogwai" key/property is currently automatically indexed in the graph.
    model.prototype.$type = model.$type = name.toLowerCase();
    model.prototype.schema = model.schema = schema;

    // Define grex getter
    var g = {
      get: function() { return self.base.connection.grex; }
    };
    Object.defineProperty(model, "g", g);
    Object.defineProperty(model.prototype, "g", g);

    // Define Gremlin getter
    var gremlin = {
      get: function() {
        //todo: avoid bind() trick?
        return self.base.client.gremlin.bind(self.base.client);
      }
    };

    Object.defineProperty(model, "gremlin", gremlin);
    Object.defineProperty(model.prototype, "gremlin", gremlin);

    // Attach custom methods (schema methods first, then custom Groovy: avoid accidental replacements)
    this.attachGroovyFunctions(model, groovyFileContent);
    this.attachSchemaFunctions(model, schema);

    model.init();

    return model;
  };

  /**
   * Attach custom Schema static methods and instance methods to the model.
   *
   * @param {Model} model
   * @param {Schema} schema
   */
  ModelCompiler.prototype.attachSchemaFunctions = function(model, schema) {
    var fnName;

    // Add instance methods
    for (fnName in schema.methods) {
      model.prototype[fnName] = schema.methods[fnName];
    }

    // Add class methods
    for (fnName in schema.statics) {
      model[fnName] = schema.statics[fnName];
    }
  };

  /**
   * Attach Gremlin methods defined in a seperate .groovy files to the model
   * as getters.
   *
   * @param {Model} model
   * @param {String} groovyFileContent
   */
  ModelCompiler.prototype.attachGroovyFunctions = function(model, groovyFileContent) {
    var groovyFunctions = this.groovyParser.scan(groovyFileContent);
    var fnName, fnBody, groovyFunctionGetter;

    for (fnName in groovyFunctions) {
      fnBody = groovyFunctions[fnName];
      groovyFunctionGetter = ModelCompiler.defineGroovyFunctionGetter(fnBody);

      Object.defineProperty(model, fnName, groovyFunctionGetter);
    }
  };

  /*
   * Build a getter for a given GroovyScript
   *
   * @param {GroovyScript}
   */
  ModelCompiler.defineGroovyFunctionGetter = function(groovyScript) {
    var groovyGetter = {
      get: function() {
        return function() {
          // Get optional callback as last parameter)
          var callback = _.last(arguments);

          // Handle the special behavior of _.initial() when the only supplied
          // argument (= the first argument) *is NOT* a callback. Indeed:
          // _.initial() will return nothing when arguments.length === 1.
          //
          // This ultimately causes no parameters to be passed over to the
          // Groovy function: because the first element is also the last one,
          // it just gets stripped.
          //
          // This is an expected behavior of _.initial().
          if (arguments.length === 1 && typeof arguments[0] !== "function" ) {
            params = arguments;
          } else {
            params = _.initial(arguments);
          }

          return this.gremlin(groovyScript, params, callback);
        };
      }
    };

    return groovyGetter;
  };

  return ModelCompiler;

})();
