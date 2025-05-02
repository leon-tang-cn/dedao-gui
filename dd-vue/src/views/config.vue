<template>
  <div class="container">
    <el-input v-model="outputDir"></el-input>
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
  align-items: flex-start;
  gap: 10px;
}
</style>