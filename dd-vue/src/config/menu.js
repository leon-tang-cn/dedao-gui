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
        icon: "HomeFilled"
      }
    },
    {
      id: 2,
      name: "ebookLib",
      path: "/ebooks",
      meta: {
        menuName: "电子书库",
        icon: "models"
      }
    },
    {
      id: 3,
      name: "ebook",
      path: "/ebook",
      meta: {
        menuName: "我的书架",
        icon: "models"
      }
    },
    {
      id: 9,
      name: "config",
      path: "/config",
      meta: {
        menuName: "配置",
        icon: "setting"
      }
    }
  ]
  return menus;
}