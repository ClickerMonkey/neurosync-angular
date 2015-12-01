
// Config

QUnit.config.reorder = false;

// Extra Assertions

function isInstance(model, Class, message)
{
  ok( model instanceof Class, message );
}

function isType(value, type, message)
{
  strictEqual( typeof value, type, message );
}

function hasModel(neuro, key, model, message)
{
  strictEqual( neuro.Database.get( key ), model, message );
}

// Utility Methods

var removeModule = (function(a)
{
  var $module = a.module;
  var modules = {};

  a.module = function(moduleName, dependencies)
  {
    var m = $module.apply( this, arguments );

    modules[ moduleName ] = m;

    return m;
  };

  return function(moduleName) 
  {
    delete modules[ moduleName ];
  };

})(angular);

function ngRouteInjector(onInjector)
{
  removeModule('ngRoute');
  removeModule('ui.router');

  reloadLibrary(function()
  {
    $route = {current: {}};

    angular.module('ngRoute', []).constant('$route', $route);

    var $injector = angular.injector(['ng', 'ngMock', 'neurosync', 'ngRoute']);

    onInjector( $injector );
  });
}

function uiRouterInjector(onInjector)
{
  removeModule('ngRoute');
  removeModule('ui.router');

  reloadLibrary(function()
  {
    $stateParams = {};
  
    angular.module('ui.router', []).constant('$stateParams', $stateParams);

    var $injector = angular.injector(['ng', 'ngMock', 'neurosync', 'ui.router']);

    onInjector( $injector );
  });
}

function reloadLibrary(onLoaded)
{
  var script = document.createElement('script');
  script.onload = onLoaded;
  script.src = '../build/neurosync-angular.js?nocache=' + Math.random();

  document.getElementsByTagName('head')[0].appendChild(script);
}

function wait(millis, callback)
{
  setTimeout( callback, millis );
}

// Mock Angular Objects
function MockScope()
{
  this.listens = 0;
  this.evals = 0;
  this.destroys = 0;
  this.callback = null;
}

MockScope.prototype =
{
  $on: function(event, callback)
  {
    this.listens++;
    this.callback = callback;
  },

  $evalAsync: function(callback)
  {
    this.evals++;
    callback();
  },

  $destroy: function()
  {
    if ( this.callback )
    {
      this.destroys++;
      this.callback();
      this.callback = null;
    }
  }
};

// Neuro.store."database name".(put|remove|all)

Neuro.store = function(database)
{
  var store = Neuro.store[ database.name ];

  if ( !store )
  {
    store = Neuro.store[ database.name ] = new TestStore();
  }

  return store;
};

function TestStore()
{
  this.map = new Neuro.Map();
  this.valid = true;
  this.delay = 0;
  this.lastKey = this.lastRecord = null;
}

TestStore.prototype = 
{
  finishDelayed: function(success, failure, arg0, arg1)
  {
    var store = this;

    if ( store.delay > 0 )
    {
      setTimeout(function()
      {
        store.finish( success, failure, arg0, arg1 );

      }, store.delay );
    }
    else
    {
      store.finish( success, failure, arg0, arg1 );
    }
  },
  finish: function(success, failure, arg0, arg1)
  {
    if ( this.valid )
    {
      if ( success ) success( arg0, arg1 );
    }
    else
    {
      if ( failure ) failure( arg0, arg1 );
    }
  },
  get: function(key, success, failure)
  {
    this.lastKey = key;

    var map = this.map;
    function onGet()
    {
      var model = map.get( key );
      if ( model ) {
        success.call( this, key, model );
      } else {
        failure.apply( this );
      }
    }

    this.finishDelayed( onGet, failure );
  },
  save: function(model, success, failure)
  {
    this.put( model.$key(), model, success, failure );
  },
  put: function(key, record, success, failure)
  {
    this.lastKey = key;
    this.lastRecord = record;

    var map = this.map;
    function onPut()
    {
      map.put( key, record );
      success.apply( this, arguments );
    }

    this.finishDelayed( onPut, failure, key, record );
  },
  remove: function(key, success, failure)
  {
    this.lastKey = key;

    var map = this.map;
    var removed = map.get( key );
    function onRemove()
    {
      map.remove( key );
      success.apply( this, arguments );
    }

    this.finishDelayed( onRemove, failure, key, removed );
  },
  all: function(success, failure)
  {
    this.finishDelayed( success, failure, this.map.values, this.map.keys );
  }
};


// Neuro.live."database name".(save|remove)

Neuro.live = function(database, onPublish)
{
  var live = Neuro.live[ database.name ];

  if ( !live )
  {
    live = Neuro.live[ database.name ] = new TestLive( database, onPublish );
  }

  live.onPublish = onPublish;

  return live.handleMessage();
};

function TestLive(database, onPublish)
{
  this.database = database;
  this.onPublish = onPublish;
  this.onHandleMessage = null;
  this.lastMessage = null;
}

TestLive.prototype = 
{
  save: function(data)
  {
    var key = this.database.buildKeyFromInput( data );

    this.onPublish({
      op: Neuro.Database.Live.Save,
      model: data,
      key: key
    });
  },
  remove: function(input)
  {
    var key = this.database.buildKeyFromInput( input );

    this.onPublish({
      op: Neuro.Database.Live.Remove,
      key: key
    });
  },
  handleMessage: function()
  {
    var live = this;

    var onMessage = function(message)
    {
      live.lastMessage = message;
      
      if ( live.onHandleMessage )
      {
        live.onHandleMessage( message );
      }
    };

    onMessage.live = live;

    return onMessage;
  }
};

// Neuro.rest."database name".(all|create|update|remove)
 
Neuro.rest = function(database)
{
  var rest = Neuro.rest[ database.name ];

  if ( !rest )
  {
    rest = Neuro.rest[ database.name ] = new TestRest();
  }

  return rest;
};

function TestRest()
{
  this.map = new Neuro.Map();
  this.queries = new Neuro.Map();
  this.status = 200;
  this.returnValue = false;
  this.delay = 0;
  this.lastModel = this.lastRecord = null;
}

TestRest.prototype =
{
  finishDelayed: function(success, failure, returnValue)
  {
    var rest = this;

    if ( rest.delay > 0 )
    {
      setTimeout(function()
      {
        rest.finish( success, failure, returnValue );

      }, rest.delay );
    }
    else
    {
      rest.finish( success, failure, returnValue );
    }
  },
  finish: function(success, failure, returnValue)
  {
    var offline = !Neuro.online || Neuro.forceOffline;
    var status = offline ? 0 : this.status;
    var successful = status >= 200 && status < 300;
    var returnedValue = this.returnValue || returnValue;

    if ( successful )
    {
      if ( success ) success( returnedValue, status );        
    }
    else
    {
      if ( failure ) failure( returnedValue, status );
    }
  },
  get: function(model, success, failure)
  {
    this.lastModel = model;

    var map = this.map;
    function onGet()
    {
      var cached = map.get( model.$key() );
      if ( cached ) {
        success.call( this, cached );
      } else {
        failure.call( this, null, -1 );
      }
    }

    this.finishDelayed( onGet, failure, null );
  },
  create: function(model, encoded, success, failure)
  {
    this.lastModel = model;
    this.lastRecord = encoded;

    var map = this.map;
    function onCreate() 
    {
      map.put( model.$key(), encoded );
      success.apply( this, arguments );
    }

    this.finishDelayed( onCreate, failure, {} );
  },
  update: function(model, encoded, success, failure)
  {
    this.lastModel = model;
    this.lastRecord = encoded;

    var map = this.map;
    function onUpdate()
    {
      var existing = map.get( model.$key() );
      Neuro.transfer( encoded, existing );
      success.apply( this, arguments );
    }

    this.finishDelayed( onUpdate, failure, {} );
  },
  remove: function(model, success, failure)
  {
    this.lastModel = model;

    var map = this.map;
    function onRemove()
    {
      map.remove( model.$key() );
      success.apply( this, arguments );
    }

    this.finishDelayed( onRemove, failure, {} );
  },
  all: function(success, failure)
  {
    this.finishDelayed( success, failure, this.map.values );
  },
  query: function(query, success, failure)
  {
    this.finishDelayed( success, failure, this.queries.get( query ) );
  }
};
