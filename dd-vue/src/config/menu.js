export function getMenus() {
  const menus = [
    // {
    //   id: 0,
    //   name: "buttonAction",
    //   path: "/",
    //   meta: {
    //     menuName: "首页",
    //     icon: "HomeFilled"
    //   }
    // },
    {
      id: 1,
      name: "home",
      path: "/",
      meta: {
        menuName: "首页",
        icon: "HomeFilled",
        show: true
      }
    },
    {
      id: 2,
      name: "ebookLib",
      path: "/ebooks",
      meta: {
        menuName: "电子书库",
        icon: "models",
        show: true
      }
    },
    {
      id: 3,
      name: "ebook",
      path: "/ebook",
      meta: {
        menuName: "我的书架",
        icon: "models",
        show: true
      }
    },
    {
      id: 4,
      name: "buttonAction",
      path: "/buttonAction",
      meta: {
        menuName: "下载",
        icon: "models",
        show: false
      }
    },
    {
      id: 5,
      name: "dedaoHome",
      path: "/dedaoHome",
      meta: {
        menuName: "得到官网",
        icon: "HomeFilled",
        show: true,
        electron: true,
        windowName: 'ddwindow'
      }
    },
    {
      id: 9,
      name: "config",
      path: "/config",
      meta: {
        menuName: "配置",
        icon: "setting",
        show: true
      }
    }
  ]
  return menus;
}