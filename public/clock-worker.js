// Keep OBS updates independent of foreground painting, as in Mesh Avatar Studio.
setInterval(()=>self.postMessage(null),1000/30);
