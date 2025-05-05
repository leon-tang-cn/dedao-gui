<template>
  <div class="container">
    <div class="container-header">
      <div style="display: flex;flex-flow: row nowrap;gap: 40px;align-items: center;">
        <!-- <el-button type="primary" :loading="onLibLoading" @click="getEbookList(false)">电子书库</el-button> -->
        <el-radio-group v-model="sortStrategy" @change="getEbookList(true)">
          <el-radio-button label="最热" value="HOT" />
          <el-radio-button label="最新" value="NEW" />
        </el-radio-group>
        <div style="flex: 1;display: flex;flex-flow: row nowrap;justify-content: flex-end;gap: 10px;">
          <el-input v-model="searchKeyword" placeholder="请输入关键字搜索" style="width: 300px;">
            <template #append>
              <el-button :icon="Search" :loading="onSearchLoading" @click="searchBook" />
            </template>
          </el-input>
        </div>
      </div>
    </div>
    <div v-if="categories.length > 0" style="display: flex;flex-flow: column wrap;gap: 20px;">
      <div style="display: flex;flex-flow: row nowrap;gap: 10px;">
        <span style="width: 32px;font-size: 14px;">分类</span>
        <div style="flex:1;display: flex;flex-flow: row wrap;gap: 20px;align-items: center;">
          <template v-for="(item, index) in categories">
            <span :class="['category-item', item.value == navigationId ? 'is-selected' : '']"
              @click="selectCategory(item)">{{
                item.name }}</span>
          </template>
        </div>
      </div>
      <div v-if="subCategories.length > 0" style="display: flex;flex-flow: norow wrap;gap: 10px;">
        <span style="width: 32px;"></span>
        <div
          style="flex: 1;display: flex;flex-flow: row wrap;gap: 20px;align-items: center;padding: 10px 0px;background-color: #f7f7f7;">
          <template v-for="(item, index) in subCategories">
            <span :class="['category-item', item.value == labelId ? 'is-selected' : '']" style="font-size: 12px;"
              @click="selectSubCategory(item)">{{
                item.name }}</span>
          </template>
        </div>
      </div>
    </div>
    <template v-if="ebookSearchResults.length > 0">
      <el-table :data="ebookSearchResults" style="width: 100%;flex: 1;" @selection-change="handleSearchSelectionChange">
        <el-table-column type="selection" width="55" />
        <el-table-column type="index" label="#" width="60" align="center" />
        <el-table-column label="书名" width="400">
          <template #default="scope">
            <div style="display: flex; align-items: center;gap: 10px;flex-flow: row nowrap;">
              <img :src="scope.row.image" alt="icon" style="width: 30px; height: 30px;" />
              <el-tooltip effect="light">
                <template #content>
                  <div style="width: 400px;"><span v-html="scope.row.content"></span></div>
                </template>
                <el-link><span v-html="scope.row.Title"></span></el-link>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="author" label="作者" min-width="200" />
        <el-table-column fixed="right" label="操作" min-width="120">
          <template #default="scope">
            <template v-if="scope.row.extra.product_vip_info.in_book_rack">
              <el-button size="small" plain type="info" @click="removeCart(scope.row.extra.enid, searchBook)">
                移出书架
                <el-icon>
                  <Remove />
                </el-icon>
              </el-button>
            </template>
            <template v-else>
              <el-button size="small" plain type="success" @click="addCart(scope.row.extra.enid, searchBook)">
                加入书架
                <el-icon>
                  <ShoppingCart />
                </el-icon>
              </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <div style="display: flex;flex-flow: row nowrap;justify-content: space-between;">
        <div style="display: flex;flex-flow: row nowrap;justify-content: flex-start;">
          <el-button plain :loading="onAddAcrtLoading" @click="multiAddCart(searchBook)">
            添加到书架
            <el-icon>
              <ShoppingCart />
            </el-icon>
          </el-button>
        </div>
        <div style="display: flex;flex-flow: row nowrap;justify-content: flex-start;">
          <el-button plain :loading="onSearchLoading" :disabled="searchCurrentPage == 1" @click="prevPage">
            上一页
          </el-button>
          <el-button plain :loading="onSearchLoading" :disabled="!canSearchMore" @click="nextPage">
            下一页
          </el-button>
        </div>
      </div>
    </template>
    <template v-else>
      <el-table :data="ebookList" style="width: 100%;flex: 1;" @selection-change="handleLibSelectionChange">
        <el-table-column type="selection" width="55" />
        <el-table-column type="index" label="#" width="60" align="center" />
        <el-table-column label="书名" width="400">
          <template #default="scope">
            <div style="display: flex; align-items: center;gap: 10px;flex-flow: row nowrap;">
              <img :src="scope.row.index_img" alt="icon" style="width: 30px; height: 30px;" />
              <el-tooltip effect="light">
                <template #content>
                  <div style="width: 400px;">{{ scope.row.introduction }}</div>
                </template>
                <el-link>{{ scope.row.name }}</el-link>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="lecturer_name" label="作者" min-width="200">
        </el-table-column>
        <el-table-column fixed="right" label="操作" min-width="120">
          <template #default="scope">
            <template v-if="scope.row.is_on_bookshelf">
              <el-button size="small" plain type="info" @click="removeCart(scope.row.id_out, getEbookList)">
                移出书架
                <el-icon>
                  <Remove />
                </el-icon>
              </el-button>
            </template>
            <template v-else>
              <el-button size="small" plain type="success" @click="addCart(scope.row.id_out, getEbookList)">
                加入书架
                <el-icon>
                  <ShoppingCart />
                </el-icon>
              </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <div style="display: flex;flex-flow: row nowrap;justify-content: space-between;">
        <div style="display: flex;flex-flow: row nowrap;justify-content: flex-end;">
          <el-button plain :loading="onAddAcrtLoading" @click="multiAddCart(getEbookList)">
            添加到书架
            <el-icon>
              <ShoppingCart />
            </el-icon>
          </el-button>
        </div>
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
          layout="total, prev, pager, next, jumper, default" :total="totalCount"
          @current-change="handleCurrentChange" />
      </div>
    </template>
    <div class="container-footer"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { sendRequest } from '@/utils/request.js';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import {
  Search
} from '@element-plus/icons-vue'

const router = useRouter();

const ebookList = ref([]);
const ebookSearchResults = ref([]);
const currentPage = ref(1);
const searchCurrentPage = ref(1);
const pageSize = ref(20);
const searchPageSize = ref(10);
const totalCount = ref(0);
const searchTotalCount = ref(0);
const sortStrategy = ref("HOT");
const searchKeyword = ref("");
const requestId = ref("");
const onSearchLoading = ref(false);
const onLibLoading = ref(false);
const categories = ref([]);
const subCategories = ref([]);
const labelId = ref("");
const navigationId = ref("");
const selectedEnids = ref([]);
const onAddAcrtLoading = ref(false);
const canSearchMore = ref(false);

const selectCategory = (item) => {
  if (item.value === labelId.value) {
    return;
  }
  labelId.value = item.value;
  subCategories.value = [];
  if (item.sub_options && item.sub_options.length > 0) {
    subCategories.value = item.sub_options;
    labelId.value = item.sub_options[0].value;
  }
  navigationId.value = item.value;
  currentPage.value = 1;
  getEbookList(true);
}

const selectSubCategory = (item) => {
  if (item.value === navigationId.value) {
    return;
  }
  labelId.value = item.value;
  currentPage.value = 1;
  getEbookList(true);
}
const handleCurrentChange = (val) => {
  currentPage.value = val;
  getEbookList(true);
}
const prevPage = () => {
  if (searchCurrentPage.value > 1) {
    searchCurrentPage.value--;
  }
  searchBook();
}
const nextPage = () => {
  searchCurrentPage.value++;
  searchBook();
}
const getEbookCategory = async () => {
  const res = await sendRequest(`/api/ebook/getEbookCategory`)
  if (res.error) {
    ElMessage.error(res.message);
    if (res.error === 403) {
      router.push({ name: 'home' });
      return;
    }
    ebookList.value = [];
    return;
  }
  categories.value = res.c?.filter?.navigations?.options || [];
  labelId.value = categories.value[0].value;
  navigationId.value = categories.value[0].value;
}
const handleSearchSelectionChange = (val) => {
  selectedEnids.value = val.map(item => {
    if (!item.extra.product_vip_info.in_book_rack) {
      return item.extra.enid
    }
  });
}
const handleLibSelectionChange = (val) => {
  selectedEnids.value = val.map(item => {
    if (!item.is_on_bookshelf) {
      return item.id_out
    }
  });
}
const getEbookList = async (ignoreGetCategory) => {
  onLibLoading.value = true;
  try {
    if (!ignoreGetCategory) {
      await getEbookCategory();
    }
    const res = await sendRequest(`/api/ebook/getEbooks?currentPage=${currentPage.value - 1}&pageSize=${pageSize.value}&requestId=${requestId.value}&sortStrategy=${sortStrategy.value}&labelId=${labelId.value}&navigationId=${navigationId.value}`)

    if (res.error) {
      ElMessage.error(res.message);
      if (res.error === 403) {
        router.push({ name: 'home' });
        return;
      }
      ebookList.value = [];
      return;
    }
    ebookList.value = res.c?.product_list || [];
    if (res.c && res.c.is_more == 0) {
      totalCount.value = ebookList.value.length;
    } else {
      totalCount.value = res.c?.total || 0;
    }
  } finally {
    onLibLoading.value = false;
  }
}

const searchBook = async () => {
  if (!searchKeyword.value) {
    ElMessage.error("请输入搜索内容");
    return;
  }
  onSearchLoading.value = true;
  try {
    const res = await sendRequest(`/api/ebook/searchEbook?currentPage=${searchCurrentPage.value}&pageSize=${searchPageSize.value}&keyword=${searchKeyword.value}`)
    if (res.error) {
      ElMessage.error(res.message);
      if (res.error === 403) {
        router.push({ name: 'home' });
        return;
      }
      ebookSearchResults.value = [];
      return;
    }
    ebookSearchResults.value = res.c?.data?.moduleList?.[0]?.layerDataList || [];
    console.log(res.c?.data?.isMore === 1 )
    canSearchMore.value = res.c?.data?.isMore === 1 || false;
    requestId.value = res.c?.data?.requestId || "";
  } finally {
    onSearchLoading.value = false;
  }
}

const addCart = async (enid, callback) => {
  selectedEnids.value = [enid];
  await callAddCart(callback);
}

const multiAddCart = async (callback) => {
  onAddAcrtLoading.value = true;
  await callAddCart(callback);
  onAddAcrtLoading.value = false;
}

const callAddCart = async (callback) => {
  const res = await sendRequest(`/api/ebook/addCart`, {}, "POST", { bookEnids: selectedEnids.value })
  if (res.error) {
    ElMessage.error(res.message);
    if (res.error === 403) {
      router.push({ name: 'home' });
      return;
    }
  } else {
    ElMessage.success("加入书架成功");
    callback && callback(true);
  }
}

const removeCart = async (enid, callback) => {
  const res = await sendRequest(`/api/ebook/removeCart`, {}, "POST", { bookEnids: [enid] })
  if (res.error) {
    ElMessage.error(res.message);
    if (res.error === 403) {
      router.push({ name: 'home' });
      return;
    }
  } else {
    ElMessage.success("移出书架成功");
    callback && callback(true);
  }
}
onMounted(async () => {
  getEbookList(false);
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
  background-color: #fff;
}

.container-header {
  display: flex;
  flex-flow: column nowrap;
}

.container-footer {
  height: 20px;
}

hl {
  color: red;
}

.category-item {
  cursor: pointer;
  color: rgb(51, 51, 51);
  font-size: 14px;
}

.category-item:hover {
  color: rgb(255, 107, 0);
}

.category-item.is-selected {
  color: rgb(255, 107, 0);
}
</style>