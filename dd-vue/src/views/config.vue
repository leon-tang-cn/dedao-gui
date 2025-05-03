<template>
  <div class="container">
    <div class="config-item">
      <span class="label">输出目录：</span>
      <el-input v-model="outputDir" class="value"></el-input>
    </div>
    <el-button type="primary" @click="updateConfig">提交</el-button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { sendRequest } from '@/utils/request.js';

const outputDir = ref('');
const updateConfig = async () => {
  const res = await sendRequest('/api/config/saveConfig', { outputDir: outputDir.value }, 'POST')
  ElMessage.success(res.message);
};
onMounted(async () => {
  const res = await sendRequest('/api/config/getConfig')
  outputDir.value = res.output_dir;
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
  align-items: flex-end;
  gap: 10px;
}

.config-item {
  width: 100%;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
}
.config-item .label {
  width: 120px;
  text-align: right; 
}
.config-item .value {
  flex: 1;
}
</style>