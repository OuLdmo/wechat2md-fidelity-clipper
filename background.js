// Built-in action -> side panel behavior keeps the user gesture intact.
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true})
  .catch(error=>console.error('无法配置侧边栏',error));
