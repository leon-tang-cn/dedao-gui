export function getMenus() {
  const menus = [
    {
      id: 1,
      name: "home",
      path: "/",
      meta: {
        menuName: "首页",
        icon: "Avatar",
        show: true
      }
    },
    {
      id: 2,
      name: "ebooks",
      children: [
        {
          id: 21,
          name: "ebookLib",
          path: "/ebooks",
          meta: {
            menuName: "电子书库",
            icon: "Goods",
            show: true
          }
        },
        {
          id: 22,
          name: "ebook",
          path: "/ebook",
          meta: {
            menuName: "我的书架",
            icon: "ShoppingCartFull",
            show: true
          }
        }
      ],
      meta: {
        icon: "Reading",
        menuName: "电子书",
        show: true
      }
    },
    {
      id: 3,
      name: "listens",
      children: [
        
      ],
      meta: {
        icon: "Headset",
        menuName: "听书",
        show: false
      }
    },
    {
      id: 4,
      name: "buttonAction",
      path: "/buttonAction",
      meta: {
        menuName: "下载",
        icon: "Menu",
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
        icon: "Setting",
        show: true
      }
    }
  ]
  return menus;
}