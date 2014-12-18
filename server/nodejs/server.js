/**
 * Lobby server providing game listings for aribtrary games.
 */
var WebSocket = require('ws');
var WebSocketServer = require('ws').Server;

exports.Server = function() {

  var Server = function(port) {
    this.sessions = [];
    this.nextId_ = 1;
    this.webSocketServer_ = new WebSocketServer({ 'port': port });
    this.webSocketServer_.on('connection', this.onConnection_.bind(this));
    console.log('Listening on ' + port);
  };

  Server.prototype = {

    /**
     * Returns the next game id.
     *
     * @return {String} The next game identifier to be used.
     */
    getNextId_: function() {
      // TODO(flackr): Investigate re-using ids.
      return (this.nextId_++).toString();
    },

    /**
     * Dispatched when a client connects to a websocket.
     *
     * @param {WebSocket} websocket A connected websocket client connection.
     */
    onConnection_: function(websocket) {
      console.log('connection for ' + websocket.upgradeReq.url);
      var self = this;
      if (websocket.upgradeReq.url == '/new') {
        this.createHost_(websocket);
        return;
      }
      this.connectClient_(websocket);
    },

    /**
     * Connect client to host.
     */
    connectClient_: function(websocket) {
      var self = this;
      var sessionId = websocket.upgradeReq.url.substr(1);
      var session = this.sessions[sessionId];
      if (!session) {
        console.log("Client connection 404 no session, sessionId "+sessionId);
        // TODO(flackr): Investigate generating this error before upgrading to
        // a websocket. (http://nodejs.org/api/http.html#http_http_createserver_requestlistener)
        websocket.send(JSON.stringify({'error': 404}));
        websocket.close();
        return;
      }

      var clientId = session.nextClientId++;
      session.clients[clientId] = {
        'socket': websocket
      };
      websocket.on('message', function(message) {
        if (!session) {
          console.log("JR client message, no session though so 404");
          websocket.send(JSON.stringify({'error': 404}));
          websocket.close();
          return;
        }
        console.log("JR client msg "+message);
        var data;
        try {
          data = JSON.parse(message);
        } catch (err) {
        }
        session.socket.send(JSON.stringify({'client': clientId, 'data': data}));
      });
      websocket.on('close', function() {
        // TODO(flackr): Test if this is called sychronously when host socket
        // closes, if so remove.
        if (!self.sessions[self.sessionId])
          return;
        session.socket.send(JSON.stringify({
          'client': clientId,
          'type': 'close'}));
        delete session.clients[clientId];
        session.clients[clientId] = undefined;
      })
    },

    createHost_: function(websocket) {
      var self = this;
      var sessionId = this.getNextId_();
      console.log('Created session ' + sessionId);
      var session = this.sessions[sessionId] = {
        'socket': websocket,
        'clients': {},
        'nextClientId': 1
      };
      websocket.on('message', function(message) {
        var data;
        try {
          data = JSON.parse(message);
        } catch (err) {
          websocket.close();
          return;
        }
        var clientId = data.client;
        var client = session.clients[clientId];
        if (!client) {
          websocket.send(JSON.stringify({
            'error': 0,
            'message': 'Client does not exist.'}));
          return;
        }
        console.log("JR HOST message: type "+data.type+" data "+data.data);
        client.socket.send(JSON.stringify(data.data));
      });
      websocket.on('close', function() {
        console.log("JR Host closed");
        for (var clientId in session.clients) {
          console.log("JR client id "+clientId);
          // Server went away while client was connecting.
          if (session.clients[clientId].socket.readyState != WebSocket.OPEN)
            continue;
          session.clients[clientId].socket.send(JSON.stringify({'error': 404}));
          session.clients[clientId].socket.close();
        }
        delete self.sessions[sessionId];
        self.sessions[sessionId] = undefined;
      });
      websocket.send(JSON.stringify({'host': sessionId}));
    },

    shutdown: function() {
      this.webSocketServer_.close();
    },

  };

  return Server;
}();
