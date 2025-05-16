<template>
    <div class="container">
        <div class="container-header">
            <div class="container-title">书名</div>
            <el-input v-model="keyword" clearable placeholder="请输入书名查找" @change="getEbookList" style="flex: 1;" />
            <div class="container-title">分类</div>
            <el-select v-model="selectedCategories" clearable multiple collapse-tags collapse-tags-tooltip  placeholder="选择分类查找" style="width: 240px">
                <el-option v-for="item in categoryList" :key="item.value" :label="item.category" :value="item.category" />
            </el-select>
            <el-button type="primary" @click="getEbookList">搜索</el-button>
        </div>
        <el-table :data="ebookList" style="width: 100%;flex: 1;">
            <el-table-column type="index" label="#" width="60" align="center" />
            <el-table-column label="书名" min-width="300">
                <template #default="scope">
                    <div style="display: flex; align-items: center;gap: 10px;flex-flow: row nowrap;">
                        <el-tooltip effect="light">
                            <template #content>
                                <div style="width: 400px;">{{ scope.row.introduction }}</div>
                            </template>
                            <el-link>{{ scope.row.title }}</el-link>
                        </el-tooltip>
                    </div>
                </template>
            </el-table-column>
            <el-table-column prop="author" label="作者" min-width="160" />
            <el-table-column prop="category" label="分类" min-width="160" />
        </el-table>
        <div style="display: flex;flex-flow: row nowrap;justify-content: flex-end;">
            <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
                layout="total, prev, pager, next, jumper, default" :total="totalCount" @size-change="handleSizeChange"
                @current-change="handleCurrentChange" />
        </div>
        <div class="container-footer"></div>
    </div>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { sendRequest } from '@/utils/request.js';
import { ElMessage } from 'element-plus';

const ebookList = ref([]);
const currentPage = ref(1);
const pageSize = ref(20);
const totalCount = ref(0);
const onActionRun = ref(false);
const keyword = ref('');
const selectedCategories = ref([]);
const categoryList = ref([]);

const handleSizeChange = (val) => {
    pageSize.value = val;
    getEbookList();
}
const handleCurrentChange = (val) => {
    currentPage.value = val;
    getEbookList();
}
const getEbookList = async () => {
    onActionRun.value = true;
    try {
        const res = await sendRequest(`/api/localEbooks/getLocalBooks?currentPage=${currentPage.value}&pageSize=${pageSize.value}${keyword.value ? `&keyword=${keyword.value}` : ''}${selectedCategories.value.length ? `&categories=${selectedCategories.value.join(',')}` : ''}`)

        if (res.error) {
            ElMessage.error(res.message);
            if (res.error === 403) {
                router.push({ name: 'home' });
                return;
            }
            ebookList.value = [];
            return;
        }
        ebookList.value = res.datas || [];
        totalCount.value = res.totalCount || 0;
    } catch (error) {
        ElMessage.error(error);
    } finally {
        onActionRun.value = false;
    }
}
const getCategories = async () => {
    try {
        const res = await sendRequest(`/api/localEbooks/getCategories`)

        if (res.error) {
            ElMessage.error(res.message);
            if (res.error === 403) {
                router.push({ name: 'home' });
                return;
            }
            ebookList.value = [];
            return;
        }
        categoryList.value = res.datas || [];
    } catch (error) {
        ElMessage.error(error);
    }
}

onMounted(async () => {
    await getCategories();
    await getEbookList();
})
</script>
<style scoped>
.container {
    text-align: center;
    padding: 20px;
    overflow: auto;
    height: 100%;
    display: flex;
    flex-flow: column nowrap;
    gap: 10px;
}

.container-header {
    display: flex;
    flex-flow: row nowrap;
    justify-content: flex-start;
    align-items: center;
    gap: 10px;
}

.container-title {
    width: 100px;
    text-align: right;
}

.container-footer {
    height: 20px;
}
</style>