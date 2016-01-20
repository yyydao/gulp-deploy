'use strict';

const gulp = require('gulp');
const less = require('gulp-less');
const sass = require('gulp-sass');
const prefix = require('gulp-autoprefixer');
const cssmin = require('gulp-cssmin');
const uglify = require('gulp-uglify');
const sourcemaps = require('gulp-sourcemaps');
const browserSync = require('browser-sync');
const rename = require('gulp-rename');
const RevAll = require('gulp-rev-all');
const mime = require('mime-types');
const path = require('path');
const Filter = require('gulp-filter');
const debug = require('gulp-debug');
const glob = require('glob');
const revRelace = require('gulp-rev-replace');
const ngAnnotate = require('gulp-ng-annotate');

const UPYUN = require('upyun');
const gulpConfig = require('./config/config.json');
const upyunConfig = gulpConfig.upyun;

const del = require('del');
const args = require('minimist')(process.argv.slice(2));
// 0:node,1:文件路径
const reload = browserSync.reload;

// jsp文件夹
let targetPath;

/**
 1.-n : 构建项目名称，必须带上
 2.--dist : 是否对工程进行构建（如果不构建，就启动当前项目）
 */
// 1.获取项目名称
if (!args.n) {
  console.log('请使用 -n 参数设置项目名称， 比如 -n view/0818/web');
  process.exit(0);
}

//需要修改资源引用的文件夹
if (args.t) {
  targetPath = args.t.toString();
}
// 2. 是否进行构建
// （当启动服务器的时候是在项目工程启动还是构建目录启动）
if (args.dist) args.domain = false;

// 3.控制是否线上发布
// 获取线上版本参数
const projectName = args.n.toString();
const cdn = gulpConfig.production_cdn.domain

// 4.获取路径
// dir代表当前gulpfile.js所在目录，一般就是根目录。resolve相当于不断的调用系统的cd命令,将path一路拼接起来
const paths = {
  dir: path.resolve(__dirname),
  dist: path.resolve(__dirname, 'dist', projectName),
  jsp: path.resolve(__dirname, 'dist', projectName, 'jsp'),
};

const projPath = path.resolve(paths.dir, projectName);
const projectBase = projPath;


gulp.task('clean', () => del([paths.dist]));

function browserSyncFn() {
  browserSync({
    server: {
      baseDir: projectBase,
    }
  });
}

gulp.task('browser-sync', () => {
  browserSync.init(['css/*.css', '*.js'], {
    server: { baseDir: projectBase },
    port: 80,
  });
});

// LESS
gulp.task('less', () => {
  return gulp.src(['./' + projectBase + '/less/shop.less'])
    .pipe(less())
    .pipe(gulp.dest('./' + projectBase + '/css/'))
    .pipe(browserSync.reload({ stream: true }));
});

// SASS

// 带sourcemap的sass开发用编译
gulp.task('sass-dev', () => {
  return gulp.src(projectBase + '/scss/**/*.scss')
    .pipe(sourcemaps.init())
    .pipe(sass().on('error', sass.logError))
    .pipe(sourcemaps.write())
    .pipe(prefix('last 2 versions'))
    .pipe(gulp.dest(projectBase + '/css/'));
});

// 无sourcemap的sass上线用编译
gulp.task('sass-prod', () => {
  return gulp.src(projectBase + '/scss/**/*.scss')
    .pipe(sass().on('error', sass.logError))
    .pipe(prefix('last 2 versions'))
    .pipe(gulp.dest(projectBase + '/css/'));
});

// 压缩sass生成的css文件
gulp.task('sass-min', ()=> {
  return gulp.src(projectBase + '/scss/**/*.scss')
    .pipe(sass().on('error', sass.logError))
    .pipe(prefix('last 2 versions'))
    .pipe(cssmin())
    .pipe(rename({
      suffix: '.min',
    }))
    .pipe(gulp.dest(projectBase + '/css/'));
});

// 压缩js  @todo:refactor with filter module
gulp.task('compressjs', () => {
  const compressjsConfig = {
    mangle: { except: ['$', 'define', 'require', 'exports'] },
    compress: false,
  };
  return gulp.src([projPath + '/**/*.{js}'])
    .on('end', () => {
      console.log('读取JS文件路径 \n' + projectBase);
    })
    .pipe(uglify(compressjsConfig))

    .pipe(rename({
      extname: '_min.js',
    }))
    .pipe(gulp.dest(projectBase + '/js'))
    .on('end', () => {
      console.log('JS压缩完成，输出到 \n' + projectBase + '/js');
    });
});

// 上线后debug   @todo:refactor with filter module
gulp.task('watch-debug', () => {
  gulp.series('sass-dev', 'compressjs');
  gulp.watch(['scss/**/*.scss', 'scss/**/*.sass', 'js/**/*.js'], { cwd: projectBase }, () => {
    gulp.series('sass-dev', 'compressjs');
  });
});

// 上线后debug
gulp.task('watch-debug-min', () => {
  gulp.parallel('sass-min', 'compressjs');
  gulp.watch(['scss/**/*.scss', 'scss/**/*.sass', 'js/**/*.js'], { cwd: projectBase }, () => {
    gulp.parallel('sass-min', 'compressjs');
  });
});

gulp.task('clean', () => {
  return del([paths.dist]);
});


// sass开发用watch,默认端口3000
gulp.task('watch-all', gulp.series('sass-dev', ()=> {
    browserSyncFn();
    gulp.watch(['scss/**/*.scss', 'scss/**/*.sass', 'js/**/*.js', '*.html','**/**/*.html'],
      { cwd: projectBase },
      gulp.series('sass-dev', ()=>reload())
    );
  })
);

gulp.task('build', gulp.series('clean', () => {
  const revAll = new RevAll({
    // html,.min.js,.min.css不加md5
    dontRenameFile: ['.html', '.min.js', '.min.css', /angular\/.*/g],
    dontUpdateReference: ['.html', /angular\/.*/g, '.min.css'],
    transformPath(rev, source, file) {
      /* rev - revisioned reference path  调整后的路径
       source - original reference path  源路径(相对于html的路径)
       path - path to the file         文件路径(绝对路径)*/

      // 如果是cdn绝对地址，不做转换
      if (file.path.indexOf('//') === 0) return;

      // 如果不是发布到dist目录,静态资源+cdn前缀
      if (args.domain !== false) {
        let filePath = file.path.slice(__dirname.lastIndexOf('/'));
        return cdn + filePath;
      }
      // 如果发布到dist目录，返回转化后地址
      return rev;
    }

  });

  // css，html,js筛选
  const cssFilter = Filter(['**/*.css'], { restore: true });
  const htmlFilter = Filter('**/*.html', { restore: true });
  const jsFilter = Filter(['**/*.js', '!js/angular/**'], { restore: true });
  const angularFilter = Filter(['**/*.js', 'js/angular/**'], { restore: true });

  return gulp.src([projPath + '/**/*.{png,jpg,gif,html,css,js,eot,svg,ttf,woff,woff2}'])
    .pipe(revAll.revision())
    .pipe(cssFilter)
    .pipe(cssmin())
    .pipe(cssFilter.restore)
    .pipe(gulp.dest(paths.dist))
    .pipe(jsFilter)
    .pipe(debug())
    .pipe(uglify())
    .pipe(jsFilter.restore)
    .pipe(gulp.dest(paths.dist))
    .pipe(angularFilter)
    .pipe(debug())
    .pipe(ngAnnotate())
    .pipe(debug())
    .pipe(uglify())
    .pipe(angularFilter.restore)
    .pipe(gulp.dest(paths.dist))
    .pipe(revAll.manifestFile())
    .pipe(gulp.dest(paths.dist));
}));

gulp.task('build-norev', gulp.series('clean',  () => {

  // css，html,js筛选
  const cssFilter = Filter(['**/*.css'], { restore: true });
  const htmlFilter = Filter('**/*.html', { restore: true });
  const jsFilter = Filter(['**/*.js', '!js/angular/**'], { restore: true });
  const angularFilter = Filter(['**/*.js', 'js/angular/**'], { restore: true });

  return gulp.src([projPath + '/**/*.{png,jpg,gif,html,css,js,eot,svg,ttf,woff,woff2}'])
    .pipe(cssFilter)
    .pipe(cssmin())
    .pipe(cssFilter.restore)
    .pipe(gulp.dest(paths.dist))
    .pipe(jsFilter)
    .pipe(debug())
    .pipe(uglify())
    .pipe(jsFilter.restore)
    .pipe(gulp.dest(paths.dist))
    .pipe(angularFilter)
    .pipe(debug())
    .pipe(ngAnnotate())
    .pipe(debug())
    .pipe(uglify())
    .pipe(angularFilter.restore)
    .pipe(gulp.dest(paths.dist))
}));

gulp.task('jsp-publish', gulp.series('build', ()=> {
  const manifest = gulp.src(paths.dist + '/rev-manifest.json');
  return gulp.src([targetPath + '/**/*.jsp'])
    .pipe(revRelace({ replaceInExtensions: ['.jsp'], manifest: manifest }))
    .pipe(gulp.dest(paths.jsp));
}));

gulp.task('deploy:cdn', gulp.series('clean', 'build', function upload(cb) {
    const upyun = new UPYUN(upyunConfig.bucket, upyunConfig.operator, upyunConfig.password, 'v0');
    const localFile = glob.sync(paths.dist + '/**/*.{png,jpg,gif,html,css,js,eot,svg,ttf,woff,woff2}'); // @todo:考虑到有css、js、html、img以外的文件，应修改成不上传某些东西*/;

    let i = 0;

    for(var file of localFile){

      let uploadFile = file.replace(/.:\/(.+\/)*!/, '');
      let realFileName = file.replace(glob.sync(paths.dist), '').replace(uploadFile, '').replace(/\/$/, '');
      let remotePath = '/' + projectName + realFileName;

      upyun.uploadFile(remotePath, file, mime.lookup(file), true, (err, result) => {
        if (err) console.log(err);
        if (result.statusCode !== 200) {
          console.log('好像出问题了');
          console.log(result);
        }
        i++;
        if (i === localFile.length) {
          console.log(i + '个资源文件被上传到又拍云CDN');
          cb();
        }
      });
    }

  })
);

gulp.task('deploy:cdn-norev', gulp.series('clean', 'build-norev', function upload(cb) {
    const upyun = new UPYUN(upyunConfig.bucket, upyunConfig.operator, upyunConfig.password, 'v0');
    const localFile = glob.sync(paths.dist + '/**/*.{png,jpg,gif,html,css,js,eot,svg,ttf,woff,woff2}'); // @todo:考虑到有css、js、html、img以外的文件，应修改成不上传某些东西*/;

    let i = 0;

    for(var file of localFile){
      let uploadFile = file.replace(/.:\/(.+\/)*!/, '');
      let realFileName = file.replace(glob.sync(paths.dist), '').replace(uploadFile, '').replace(/\/$/, '');
      let remotePath = '/' + projectName + realFileName;

      upyun.uploadFile(remotePath, file, mime.lookup(file), true, (err, result) => {
        if (err) console.log(err);
        if (result.statusCode !== 200) {
          console.log('好像出问题了');
          console.log(result);
        }
        i++;
        if (i === localFile.length) {
          console.log(i + '个资源文件被上传到又拍云CDN');
          cb();
        }
      });
    }
  })
);

gulp.task('sass-publish', gulp.parallel('sass-prod', 'sass-min'));

gulp.task('default', gulp.series('sass-dev', 'watch-all', 'browser-sync'));
 