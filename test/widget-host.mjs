import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
window.mount = async (html,result) => {
 const frame=document.querySelector('iframe');
 const bridge=new AppBridge(null,{name:'Clear Mermaid test host',version:'1.0'},{openLinks:{}},{hostContext:{theme:'light',displayMode:'inline'}});
 window.bridge=bridge;
 bridge.onopenlink=async ({url})=>{window.openedLink=url;return {};};
 bridge.oninitialized=async()=>{await bridge.sendToolInput({arguments:{source:result.structuredContent.source}});await bridge.sendToolResult(result);};
 await bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow));
 frame.srcdoc=html;
};
