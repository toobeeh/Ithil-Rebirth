# Ithil-Rebirth
[![part of Typo ecosystem](https://img.shields.io/badge/Typo%20ecosystem-Ithil_Rebirth-blue?style=flat&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACV0lEQVR4nO3dPUrDYByA8UQ8g15AI+gsOOnmrufoIBT0DAUFB+/R3bFTobOCwQvoJSouNcObhHyZ9n2eHwiirW3Th79J2iaJJEmSJEmSJIC06iGu1+vgz9M0Df9CY6t8PkP2fMrYDADOAOAMAM4A4OrWGl3bj0Pp8+wEgDMAuP2uD//w7I6+DEf19fbc6eadAHAGAGcAcAYAZwBwnbcCTrIj+jL8Fx/55yA34wSAMwA4A4AzADgDgDMAOAOAMwC4zjuCzi+uN9+fZgeNrvuefw+69FfL10H/fgycAHAGAGcAcAYAZwBwnbcCioZeq2+quIVS5NbBHycAnAHARffRsOksr71Ml38Bi/mk9XVH5EfDFGYAcHVbAWWjw08NbyePEaRmDADOAOAMAM4A4Fq9FjCd5cG1zaeHrPeleXnzsvl+MZ802vooe4fSatn9ftUILp/iYxlCm51UTgA4A4Dr9eXgsv3wtJdfhx71fXICwBkAXGUAv+cLCH0pHk4AOAOAMwA4A4AzALhedwRpXBVneSu9X04AOAOAMwA4A4AzADgDgDMAOAOAMwA4A4AzADgDgDMAOAOAMwA4A4AzALio3xG0bUcu3UZOADgDgDMAOAOAMwC4qLcCRjxG0M5wAsAZAJwBwBkAnAHAGQCcAcAZAJwBwBkAnAHA+Y4gOCcAnAHAGQCcAcAZAFyrrYDH++NGl7+6ZZ0yZpc4AeAMAC66HUFDnLwyZk4AOAOAKz+QfMXx58dScdz7se5o8A7t0HJzAtAZAJwBwBkAnAFIkiRJkiRJUtySJPkBweNXgRaWkYQAAAAASUVORK5CYII=)](https://github.com/topics/skribbl-typo)

Ithil-Rebirth is the **successor and re-write of toobeeh/Ithil**.  
This node-js server has the same tasks as its predecessor (see Tasks), while its focus is on improving maintainability, readability and performance boost.  
  
### ⚡ Features following changes:
- Written in **TypeScript**, using types where possible, and thoroughly commented with JSDoc
- Separated Drop Server to keep the event loop latency minimal and consistent for **all** drop recipients
- More asynchronous database execution, results in **noticeable performance boost** eg. in image cloud
- More modular code - functions like balancer, IPC connections and sockets all moved to **separate module classes**

## Tasks
The Ithil server is the interface between [a typo user on skribbl](https://github.com/toobeeh/skribbltypo) and all Palantir features.
The original PHP pseudo-api was replaced with a more and more advancing socketio server, which is now successed by this nodejs application.  

The core functionality is to provide a socketio server which a client on typo connects to.  
This socketio server has to process all events - to make clustered operation possible, multiple socketio client servers are coordinated by a main server via IPC.  
A connecting client makes a request to a socketio server on the main instance, which responds with the port of the least loaded worker socketio server.  

However, since drops are specifically time-critical, there is also a dedicated drop server process, consisting of a bare WebSocket server to dispatch drops.

## Functions & Modules
### ▶️ Entry Points 
The Ithil Server consists of different processes / main scripts, as defined in [ecosystem.config.js](ecosystem.config.js):  
- [Main Server](src/mainServer.ts):   
  Redirects clients to maintain worker load balance, manage drops & typo data; all over an IPC server
- [Worker Server](src/workerServer.ts):   
  Provides a socket-io for typo connections, managing all their events; connected via IPC to the main server
- [Drop Server](src/dropServer.ts):   
  Provides a bare WebSocket-Server for as-fast-as-possible drop dispatching; connected via IPC to the main server

### 🧩 Modules
These servers are using modules to implement their functionality:
- [IPC Server / Socket](src/ipc.ts):   
  Contains classes for the IPC Server and IPC Client.
  These classes are wrapper for the IPC instance and include interfaces, event names and predefined handlers/emitters to enable type-safe communication between main and worker.
- [Socketio Server / Socket & WebSocket Server](src/ithilSocketServer.ts):   
  A module containing all interfaces and eventnames used for the communication between balancer & client socket.io-server as well as the WebSocket server.    
  AS well as the IPC communication, event handlers/callbacks are registered and emitters are predefined to keep everything type-safe.
- [Client Balancer](src/balancer.ts):   
  The balancer class provides functions to listen to IPC events, enabling a abstracted access to the connected worker's current load balance of connected clients.    
  This way, the main server can easily get the least busy worker and send a new client to the worker's port.
- [Data Observer](src/dataObserver.ts):   
  Provides a class that observes the typo data as sprites, lobbies and similar in the database and emits events using IPC to the workers when this data changed.  
  This has the benefit that workers don't have to get the data which lowers the worker load.
- [Drops](src/drops.ts):   
  A class that keeps a loop open which continuosly observes drops, handles incoming claims from clients on their workers by the IPC connection and processes them.  
  Results are emitted via IPC to the workers.
- [TypoClient](src/typoClient.ts):   
  The final piece to the client communication from the Ithil Server to a Typo User.  
  This class contains user-related functions and a connected socketio-client that listens for all user events and sends responses to them, like image cloud requests and drop claims. 

 
  
