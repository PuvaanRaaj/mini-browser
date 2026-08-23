import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";

import type { MiniSession } from "./tabs";

export function installMenu(getSession: () => MiniSession | null, getWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === "darwin";
  const withSession = (run: (session: MiniSession) => void) => {
    const session = getSession();
    if (session) run(session);
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            role: "appMenu",
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Reset Session",
                click: () => withSession((session) => void session.handle({ type: "resetSession" })),
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Tab",
          accelerator: "CmdOrCtrl+T",
          registerAccelerator: false,
          click: () => withSession((session) => void session.handle({ type: "newTab" })),
        },
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          registerAccelerator: false,
          click: () => {
            const session = getSession();
            const id = session?.getState().activeTabId;
            if (session && id) void session.handle({ type: "closeTab", id });
          },
        },
        { type: "separator" },
        {
          label: "Reset Session",
          click: () => withSession((session) => void session.handle({ type: "resetSession" })),
        },
        ...(isMac ? [] : [{ role: "quit" as const }]),
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          registerAccelerator: false,
          click: () => withSession((session) => void session.handle({ type: "reload" })),
        },
        {
          label: "Focus Mode",
          accelerator: "CmdOrCtrl+Shift+F",
          registerAccelerator: false,
          click: () => getWindow()?.webContents.send("mini:toggle", "focus"),
        },
        {
          label: "Tabs on the Side",
          accelerator: "CmdOrCtrl+Shift+S",
          registerAccelerator: false,
          click: () => getWindow()?.webContents.send("mini:toggle", "sidebar"),
        },
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          registerAccelerator: false,
          click: () => getWindow()?.webContents.send("mini:toggle", "settings"),
        },
        {
          label: "Authenticator",
          accelerator: "CmdOrCtrl+Shift+A",
          registerAccelerator: false,
          click: () => getWindow()?.webContents.send("mini:toggle", "authenticator"),
        },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(process.env.NODE_ENV === "development" || !app.isPackaged
          ? [{ role: "toggleDevTools" as const }]
          : []),
      ],
    },
    {
      label: "Bookmarks",
      submenu: [
        {
          label: "Add Favorite",
          accelerator: "CmdOrCtrl+D",
          registerAccelerator: false,
          click: () => getWindow()?.webContents.send("mini:toggle", "bookmark"),
        },
        {
          label: "Favorites Bar",
          accelerator: "CmdOrCtrl+Shift+B",
          registerAccelerator: false,
          click: () => getWindow()?.webContents.send("mini:toggle", "favorites"),
        },
      ],
    },
    {
      label: "History",
      submenu: [
        {
          label: "Back",
          accelerator: "CmdOrCtrl+[",
          registerAccelerator: false,
          click: () => withSession((session) => void session.handle({ type: "back" })),
        },
        {
          label: "Forward",
          accelerator: "CmdOrCtrl+]",
          registerAccelerator: false,
          click: () => withSession((session) => void session.handle({ type: "forward" })),
        },
      ],
    },
    {
      label: "Go",
      submenu: [
        {
          label: "Open Location",
          accelerator: "CmdOrCtrl+L",
          registerAccelerator: false,
          click: () => {
            const window = getWindow();
            window?.webContents.focus();
            window?.webContents.send("mini:focus-url");
          },
        },
      ],
    },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
