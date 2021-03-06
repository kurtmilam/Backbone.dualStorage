(function() {
  'use strict';
  var S4, dualsync, getUrl, guid, localsync, methodMap, onlineSync, parseRemoteResponse, urlError;

  S4 = function() {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  };

  guid = function() {
    return S4() + S4() + '-' + S4() + '-' + S4() + '-' + S4() + '-' + S4() + S4() + S4();
  };

  window.Store = (function() {

    Store.prototype.sep = '';

    function Store(name) {
      var store;
      this.name = name;
      store = localStorage.getItem(this.name);
      this.records = (store && store.split(',')) || [];
    }

    Store.prototype.save = function() {
      return localStorage.setItem(this.name, this.records.join(','));
    };

    Store.prototype.create = function(model) {
      console.log('creating', model, 'in', this.name);
      if (!_.isObject(model)) return model;
      if (model.attributes != null) model = model.attributes;
      if (!model.id) model.id = guid();
      var lastLocalSaveDate = Math.round(Date.now()/1000);
      // FORMAT IS: [model, lastLocalSaveDate, lastRemoteSyncDateOffset]
      localStorage.setItem(this.name + this.sep + model.id, JSON.stringify([model,lastLocalSaveDate,0]));
      this.records.push(model.id.toString());
      this.save();
      return model;
    };

    Store.prototype.update = function(model) {
      var lastLocalSaveDate = Math.round(Date.now()/1000);
      localStorage.setItem(this.name + this.sep + model.id, JSON.stringify([model,lastLocalSaveDate,0]));
      if (!_.include(this.records, model.id.toString())) {
        this.records.push(model.id.toString());
      }
      this.save();
      return model;
    };

    Store.prototype.find = function(model) {
      console.log('finding', model, 'in', this.name);
      return JSON.parse(localStorage.getItem(this.name + this.sep + model.id))[0];
    };

    Store.prototype.findAll = function() {
      var id, _i, _len, _ref, _results;
      console.log('findAlling');
      _ref = this.records;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        id = _ref[_i];
        _results.push(JSON.parse(localStorage.getItem(this.name + this.sep + id))[0]);
      }
      return _results;
    };

    Store.prototype.destroy = function(model) {
      console.log('trying to destroy', model, 'in', this.name);
      localStorage.removeItem(this.name + this.sep + model.id);
      this.records = _.reject(this.records, function(record_id) {
        return record_id === model.id.toString();
      });
      this.save();
      return model;
    };

    return Store;

  })();

  localsync = function(method, model, options, error) {
    var response, store;
    if (typeof options === 'function') {
      options = {
        success: options,
        error: error
      };
    }
    store = model.localStorage || model.collection.localStorage;
    response = (function() {
      switch (method) {
        case 'read':
          if (model.id) {
            return store.find(model);
          } else {
            return store.findAll();
          }
          break;
        case 'create':
          return store.create(model);
        case 'update':
          return store.update(model);
        case 'delete':
          return store.destroy(model);
      }
    })();
    if (response) {
      return options.success(response);
    } else {
      return options.error('Record not found');
    }
  };

  getUrl = function(object) {
    if (!(object && object.url)) return null;
    if (_.isFunction(object.url)) {
      return object.url();
    } else {
      return object.url;
    }
  };

  parseRemoteResponse = function(object, response) {
    if (!(object && object.parseBeforeLocalSave)) return response;
    if (_.isFunction(object.parseBeforeLocalSave)) {
      return object.parseBeforeLocalSave(response);
    }
  };

  urlError = function() {
    throw new Error('A "url" property or function must be specified');
  };

  methodMap = {
    'create': 'POST',
    'update': 'PUT',
    'delete': 'DELETE',
    'read': 'GET'
  };

  onlineSync = Backbone.sync;

  dualsync = function(method, model, options) {
    var response, store, success;
    console.log('dualsync', method, model, options);
    store = new Store(getUrl(model));
    switch (method) {
      case 'read':
        if (store) {
          response = model.id ? store.find(model) : store.findAll();
          if (!_.isEmpty(response)) {
            console.log('getting local', response, 'from', store);
            options.success(response);
            return;
          }
          success = options.success;
          options.success = function(response, status, xhr) {
            var i, _i, _len;
            console.log('got remote', response, 'putting into', store);
            response = parseRemoteResponse(model, response);
            if (_.isArray(response)) {
              for (_i = 0, _len = response.length; _i < _len; _i++) {
                i = response[_i];
                console.log('trying to store', i);
                store.create(i);
              }
            } else {
              store.create(response);
            }
            return success(response);
          };
        }
        if (!model.local) return onlineSync(method, model, options);
        break;
      case 'create':
        if (!model.local && options.remote !== false) {
          onlineSync(method, model, options);
        }
        return store.create(model);
      case 'update':
        if (!model.local && options.remote !== false) {
          onlineSync(method, model, options);
        }
        return store.update(model);
      case 'delete':
        if (!model.local && options.remote !== false) {
          onlineSync(method, model, options);
        }
        return store.destroy(model);
    }
  };

  Backbone.sync = dualsync;

}).call(this);