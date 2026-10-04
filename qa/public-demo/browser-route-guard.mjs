// Only deliberately closed QA pages/contexts may discard a proxy continuation.
// Live failures remain fatal, without logging SDK request headers.
export async function guardDemoRoute(route,handler,closingPages,onFailure,contextClosing=()=>false){
  let page;
  try{page=route.request().frame().page();await handler(route);}
  catch{if(!contextClosing()&&!(page&&closingPages.has(page)))onFailure();}
}
// Ticket clearing precedes sign-in completion; the callback then navigates /app.
export const demoWorkspaceUrlReady=(url,tenant)=>url.hostname===tenant+'.shiftoryx.gr'&&url.pathname==='/app'&&!new URLSearchParams(url.hash.slice(1)).has('authTicket');
