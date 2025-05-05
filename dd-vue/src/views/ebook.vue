<template>
  <div class="container">
    <div class="container-header">
      <div style="display: flex;flex-flow: row nowrap;gap: 40px;align-items: center;">
        <!-- <el-button type="primary" @click="getEbookList">我的书架</el-button> -->
        <el-button size="small" :disabled="!multiSelected || multiSelected.length <= 0"
          @click="clearSelection">清空选择</el-button>
        <el-checkbox-group v-model="selectedTypes">
          <template v-for="item in selectTypeOptions" :key="item.value">
            <el-checkbox :value="item.value">{{ item.label }}</el-checkbox>
          </template>
        </el-checkbox-group>
        <el-button size="small" :loading="onMultiDownload" :disabled="!multiSelected || multiSelected.length <= 0"
          @click="multiDownloadFile">
          批量下载
        </el-button>
      </div>
      <div v-if="multiDownloadProgress > 0"
        style="width: 100%;display: flex;flex-flow: column nowrap;align-items: flex-start;">
        <el-progress :percentage="multiDownloadProgress" style="width: 100%;" />
        <span class="progress-text">{{ currentRowText }}</span>
      </div>
      <div v-if="progress > 0" style="width: 100%;display: flex;flex-flow: column nowrap;align-items: flex-start;">
        <el-progress :percentage="progress" style="width: 100%;" />
        <span class="progress-text">{{ currentStepText }}</span>
      </div>
    </div>
    <el-table :data="ebookList" v-loading="onActionRun" ref="mycartTable" style="width: 100%;flex: 1;"
      @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="55" />
      <el-table-column type="index" label="#" width="60" align="center" />
      <el-table-column label="书名" min-width="300">
        <template #default="scope">
          <div style="display: flex; align-items: center;gap: 10px;flex-flow: row nowrap;">
            <img :src="scope.row.icon" alt="icon" style="width: 30px; height: 30px;" />
            <el-tooltip effect="light">
              <template #content>
                <div style="width: 400px;">{{ scope.row.intro }}</div>
              </template>
              <el-link>{{ scope.row.title }}</el-link>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="author" label="作者" min-width="160" />
      <el-table-column label="详情" min-width="100" align="center">
        <template #default="scope">
          <el-popover effect="light" trigger="click" @show="getBookContent(scope.$index, scope.row.enid)">
            <div style="display: flex;flex-flow: column nowrap;gap: 5px;">
              <span v-html="scope.row.dtlCnt"></span>
            </div>
            <template #reference>
              <el-icon style="cursor: pointer;font-size: 20px;">
                <InfoFilled />
              </el-icon>
            </template>
          </el-popover>
        </template>
      </el-table-column>
      <el-table-column fixed="right" label="操作" min-width="280">
        <template #default="scope">
          <el-button size="small" @click="removeCart(scope.row.enid)">
            移出书架
            <el-icon>
              <Remove />
            </el-icon>
          </el-button>
          <el-button size="small" @click="singleDownloadFile(scope.$index, scope.row, ['pdf', 'epub'])">
            PDF, EPUB
            <el-icon>
              <Download />
            </el-icon>
          </el-button>
          <el-button size="small" @click="singleDownloadFile(scope.$index, scope.row, ['pdf'])">
            PDF
            <el-icon>
              <Download />
            </el-icon>
          </el-button>
          <el-button size="small" @click="singleDownloadFile(scope.$index, scope.row, ['epub'])">
            EPUB
            <el-icon>
              <Download />
            </el-icon>
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div style="display: flex;flex-flow: row nowrap;justify-content: space-between;">
      <div style="display: flex;flex-flow: row nowrap;justify-content: flex-start;">
        <el-button plain @click="multiRemoveCart()">
          移出书架
          <el-icon>
            <Remove />
          </el-icon>
        </el-button>
      </div>
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
import { useRouter } from 'vue-router';

const router = useRouter();
const host = import.meta.env.VITE_APP_HOST;

const ebookList = ref([]);
const selectedTypes = ref([]);
const progress = ref(0);
const multiDownloadProgress = ref(0);
const currentStepText = ref('');
const currentRowText = ref('');
const selectTypeOptions = ref([
  { value: 'pdf', label: 'PDF' },
  { value: 'epub', label: 'EPUB' },
])
const currentPage = ref(1);
const pageSize = ref(10);
const totalCount = ref(0);
const multiSelected = ref([]);
const mycartTable = ref(null);
const onActionRun = ref(false);
const onMultiDownload = ref(false);

const handleSizeChange = (val) => {
  pageSize.value = val;
  getEbookList();
}
const handleCurrentChange = (val) => {
  currentPage.value = val;
  getEbookList();
}
const processStatus = () => {
  return `${currentStepText.value}`;
};
const multiDownloadProgressStatus = () => {
  return `${currentRowText.value}`;
};

const handleSelectionChange = (val) => {
  multiSelected.value = val;
}
const clearSelection = () => {
  multiSelected.value = [];
  if (mycartTable.value) {
    mycartTable.value.clearSelection();
  }
}

selectedTypes.value = ['pdf', 'epub']

const getBookContent = async (index, enid) => {
  if (!ebookList.value[index].dtlCnt) {
    const res = await sendRequest(`/api/ebook/getEbookContent?enid=${enid}`)
    ebookList.value[index].dtlCnt = `分类：${ res.c?.classify_name || ''}</br>
    字数：${Math.ceil((res.c?.count || 0) / 1024)}千字</br>
    豆瓣得分：${ res.c?.douban_score || ''}</br>
    得到评分：${ res.c?.product_score || ''}`;
  }
}

const getEbookList = async () => {
  onActionRun.value = true;
  try {
    const res = await sendRequest(`/api/ebook/getEbookList?currentPage=${currentPage.value}&pageSize=${pageSize.value}`)

    if (res.error) {
      ElMessage.error(res.message);
      if (res.error === 403) {
        router.push({ name: 'home' });
        return;
      }
      ebookList.value = [];
      return;
    }
    ebookList.value = res.c?.list || [];
    totalCount.value = res.c?.total || 0;
  } catch (error) {
    ElMessage.error(error);
  } finally {
    onActionRun.value = false;
  }
}

const checkConfig = async () => {
  const res = await sendRequest('/api/config/getConfig')
  if (!res.output_dir) {
    ElMessage.error("请先配置输出目录！");
    router.push({ name: 'config' });
    return false;
  }
  return true;
}

const multiDownloadFile = async () => {
  const isValid = await checkConfig();
  if (!isValid) {
    return;
  }
  onMultiDownload.value = true;
  try {
    const step = Math.floor(100 / multiSelected.value.length);
    for (let i = 0; i < multiSelected.value.length; i++) {
      const row = multiSelected.value[i];
      multiDownloadProgress.value += 1;
      currentRowText.value = `正在下载第${i + 1}本: ${row.title}`;
      await downloadFile(i, row, [], i < multiSelected.value.length);
      multiDownloadProgress.value += (step - 1);
    }
    multiDownloadProgress.value = 100;
    setTimeout(() => {
      multiDownloadProgress.value = 0;
    }, 3000);
  } catch (error) {
    ElMessage.error(error);
  } finally {
    onMultiDownload.value = false;
  }
}

const singleDownloadFile = async (index, row, types) => {
  const isValid = await checkConfig();
  if (!isValid) {
    return;
  }
  onActionRun.value = true;
  try {
    await downloadFile(index, row, types);
  } catch (error) {
    ElMessage.error(error);
  } finally {
    onActionRun.value = false;
  }
}

const downloadFile = async (index, row, types, isMore) => {
  return new Promise((resolve, reject) => {
    let fetchTypes = [];
    if (types && types.length > 0) {
      fetchTypes = types;
    } else {
      fetchTypes = selectedTypes.value;
    }
    progress.value = 0;
    currentStepText.value = ''
    const eventSource = new EventSource(`${host}/api/ebook/getEbookDetail?enid=${row.enid}&eType=${JSON.stringify(fetchTypes)}`);

    const totalSteps = 3 + fetchTypes.length;
    const step = 10;
    let pageStep = 0;

    eventSource.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.processStep) {
        progress.value += step;
        currentStepText.value = `${data.processStep}`
      }
      if (data.steps && data.steps > 0) {
        pageStep = Math.floor((100 - (10 * totalSteps)) / data.steps);
        if (!pageStep) {
          pageStep = 1;
        }
      }
      if (data.processKey && pageStep > 0) {
        progress.value += pageStep;
        currentStepText.value = `${data.processKey}`
      }
      if (data.finalResult) {
        progress.value = 100;
        currentStepText.value = data.finalResult
        eventSource.close();
        resolve();
        if (!isMore) {
          setTimeout(() => {
            progress.value = 0;
            currentStepText.value = ''
          }, 3000);
        }
      }
      if (data.error) {
        currentStepText.value = data.error
        eventSource.close();
        reject(data.error);
      }
    };

    eventSource.onerror = (error) => {
      currentStepText.value = '发生错误'
      eventSource.close();
      reject(error);
    };
  });
}

const removeCart = async (enid) => {
  const res = await sendRequest(`/api/ebook/removeCart`, {}, "POST", { bookEnids: [enid] })
  if (res.error) {
    ElMessage.error(res.message);
    if (res.error === 403) {
      router.push({ name: 'home' });
      return;
    }
  } else {
    ElMessage.success("移出书架成功");
    await getEbookList();
  }
}
const multiRemoveCart = async () => {
  const res = await sendRequest(`/api/ebook/removeCart`, {}, "POST", { bookEnids: multiSelected.value.map(item => item.enid) })
  if (res.error) {
    ElMessage.error(res.message);
    if (res.error === 403) {
      router.push({ name: 'home' });
      return;
    }
  } else {
    ElMessage.success("移出书架成功");
    await getEbookList();
  }
}
onMounted(async () => {
  getEbookList();
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
  flex-flow: column nowrap;
}

.container-footer {
  height: 20px;
}

.progress-text {
  font-size: 14px;
  color: #ccc;
}
</style>