import { createRouter, createWebHashHistory } from 'vue-router';
import { getMenus } from '@/config/menu.js';

const routes = [];
const menuData = getMenus();
menuData.forEach(menu => {
    if (menu.children) {
        menu.children.forEach(child => {
            routes.push({
                path: child.path,
                name: child.name,
                component: () => import(`../views/${child.name}.vue`)
            });
        });
    } else {
        routes.push({
            path: menu.path,
            name: menu.name,
            component: () => import(`../views/${menu.name}.vue`)
        });
    }
});

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

export default router;
