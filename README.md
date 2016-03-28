# Gulp deploy tool

use Gulp 4.0 and ES2015

# 使用指南

```
// 常用命令
-n 参数表示要处理的文件夹

// 带sourcemap的sass自动编译
gulp sass-dev -n example_dir

// 压缩sass生成的css文件
gulp sass-min -n example_dir

// 开发用watch&reload,默认端口3000
gulp watch-all -n example_dir

// 发布到CDN，带md5的非覆盖式发布
gulp deploy:cdn -n example_dir

// 发布到CDN，覆盖更新
gulp deploy:cdn-norev -n example_dir
```