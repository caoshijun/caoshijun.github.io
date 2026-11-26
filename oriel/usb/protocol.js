/* Shared browser/test decoder. Commit a token only after a complete frame. */
(function(root){
 class ScreenDecoder {
  constructor(){this.reset();}
  reset(){this.frame=null;this.position=0;this.token=null;}
  accept(msg){
   if(msg.op==='screen'){
    this.reset();
    if(!((msg.width===320&&msg.height===240)||(msg.width===240&&msg.height===320))||!Number.isInteger(msg.token)||msg.token<0||msg.token>0xffffffff)throw Error('Invalid screen header');
    this.frame={width:msg.width,height:msg.height,pixels:new Uint8ClampedArray(msg.width*msg.height*4),token:msg.token};return null;
   }
   if(msg.op==='pixels'){
    if(!this.frame||typeof msg.data!=='string'||!msg.data.length||msg.data.length%8||!/^[0-9a-f]+$/i.test(msg.data))throw Error('Invalid screen chunk');
    for(let i=0;i<msg.data.length;i+=8){
     const count=parseInt(msg.data.slice(i,i+4),16),color=parseInt(msg.data.slice(i+4,i+8),16);
     if(!count||this.position+count>this.frame.width*this.frame.height)throw Error('Invalid run');
     for(let n=0;n<count;n++){const at=this.position++*4;this.frame.pixels.set([Math.round((color>>11)*255/31),Math.round(((color>>5)&63)*255/63),Math.round((color&31)*255/31),255],at);}
    }return null;
   }
   if(msg.op==='screen-end'){
    if(!this.frame||this.position!==this.frame.width*this.frame.height)throw Error('Incomplete screen');
    const frame=this.frame;this.token=frame.token;this.frame=null;return frame;
   }
   return null;
  }
 }
 root.OrielUSB={ScreenDecoder};
})(globalThis);
