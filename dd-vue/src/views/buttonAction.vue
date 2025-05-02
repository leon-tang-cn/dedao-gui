<template>
  <div class="container" v-loading="onPageLoading">
    <div style="display: flex;flex-flow: row wrap;gap: 40px;">
      <span>{{ bookTitle }}</span>
      <span>{{ bookAuthor }}</span>
      <span>{{ bookIntro }}</span>
    </div>
    <div style="display: flex;flex-flow: row nowrap;gap: 40px;">
      <el-checkbox-group v-model="selectedTypes">
        <template v-for="item in selectTypeOptions" :key="item.value">
          <el-checkbox :value="item.value">{{ item.label }}</el-checkbox>
        </template>
      </el-checkbox-group>
      <el-button type="primary" :loading="onExecuting" @click="downloadFile">下载</el-button>
    </div>
    <div v-if="progress > 0">
      <el-progress :percentage="progress" :format="processStatus" style="width: 100%;" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { sendRequest } from '@/utils/request.js';
const host = import.meta.env.VITE_APP_HOST;

const onPageLoading = ref(false);
const selectedTypes = ref([]);
const progress = ref(0);
const currentStepText = ref('');
const selectTypeOptions = ref([
  { value: 'pdf', label: 'PDF' },
  { value: 'epub', label: 'EPUB' },
])
const queryParams = ref({});
const bookTitle = ref('');
const bookAuthor = ref('');
const bookIntro = ref('');
const onExecuting = ref(false);

selectedTypes.value = ['pdf', 'epub'];
const processStatus = () => {
  return `${currentStepText.value}`;
};

const setParams = async () => {
  setTimeout(async () => {
    if (window.electronAPI) {
      const params = window.electronAPI.getParams()
      queryParams.value = params.queryParams;
      await getEbookOutline(queryParams.value.id);
      onPageLoading.value = false;
    } else {
      await setParams();
    }
  }, 1000)
}

const getEbookOutline = async (enid) => {
  try {
    const res = await sendRequest('/api/ebook/getEbookOutline', { enid })
    bookTitle.value = res.data.title;
    bookAuthor.value = res.data.author;
    bookIntro.value = res.data.intro;
  } catch (error) {
    console.log(error);
  }
}

const downloadFile = async () => {
  onExecuting.value = true;
  progress.value = 0;
  currentStepText.value = ''
  const eventSource = new EventSource(`${host}/api/ebook/getEbookDetail?enid=${queryParams.value.id}&eType=${JSON.stringify(selectedTypes.value)}`);

  const totalSteps = 3 + selectedTypes.value.length;
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
      onExecuting.value = false;
      setTimeout(() => {
        progress.value = 0;
        currentStepText.value = ''
      }, 3000);
    }
    if (data.error) {
      currentStepText.value = data.error
      eventSource.close();
      onExecuting.value = false;
    }
  };

  eventSource.onerror = (error) => {
    currentStepText.value = '发生错误'
    eventSource.close();
    onExecuting.value = false;
  };
}

onMounted(async () => {
  onPageLoading.value = true;
  try {
    await setParams();
  } catch (error) {
    console.log(error);
  }
})
</script>

<style scoped>
.container {
  padding: 20px;
  overflow: auto;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 20px;
}
</style>