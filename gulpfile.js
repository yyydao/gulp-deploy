var gulp = require('gulp'),
    less = require('gulp-less'),
    sass = require('gulp-sass'),
    prefix = require('gulp-autoprefixer'),
    cssmin = require('gulp-cssmin'),
    uglify = require('gulp-uglify'),
    watch = require('gulp-watch'),
    plumber = require('gulp-plumber'),
    sourcemaps = require('gulp-sourcemaps'),
    browserSync = require('browser-sync').create(), //移动端调试神器
    url = require('url'),
    concat = require('gulp-concat'),
    rename = require('gulp-rename'),
    gutil = require('gulp-util'),
    RevAll = require('gulp-rev-all'),
    coffee = require('gulp-coffee'),
    mime = require('mime-types'),
    path = require('path'),
    Filter = require('gulp-filter'),
    rsync = require('gulp-rsync'),
    debug = require('gulp-debug'),
    glob = require('glob');

var UPYUN = require('./upyun/index.js');
var config = require('./config/config.json');
var upyun_config = config.upyun;

var del = require('del');        //清理文件夹，可选
var args = require('minimist')(process.argv.slice(2)); //关键：读取传入参数，其中minimist是一个命令行插件。
                                                       //0:node,1:文件路径
var reload = browserSync.reload;

//1.-n : 构建项目名称，必须带上
//2.--dist : 是否对工程进行构建（如果不构建，就启动当前项目）
//3.--production: 控制是否线上发布，可选

// 1.获取项目名称
if (!args.n) {
    console.log('请使用 -n 参数设置项目名称， 比如 -n view/0818/web');
    process.exit(0);
}
var projectName = args.n.toString();

// 2. 是否进行构建
//（当启动服务器的时候是在项目工程启动还是构建目录启动）
if (args.dist) args.domain = false;

// 3.控制是否线上发布
var isProduction = args.production; //获取线上版本参数
var cdn = isProduction
    ? config.production_cdn.domain
    : config.test_server.domain;

//4.获取路径
//dir代表当前gulpfile.js所在目录，一般就是根目录。resolve相当于不断的调用系统的cd命令,将path一路拼接起来
var paths = {
    dir: path.resolve(__dirname),
    dist: path.resolve(__dirname, 'dist', projectName)
};

var projPath = path.resolve(paths.dir, projectName);
gulp.task('clean', () => {
    return del([paths.dist]);
});

var projectBase = projPath;

gulp.task('browser-sync', () => {
    browserSync.init(['css/*.css', '*.js'], {
        server: {
            baseDir: projectBase
        },
        port: 80
    });
});

// LESS
gulp.task('less', () => {
    return gulp.src(['./' + projectBase + '/less/shop.less'])
        .pipe(less())
        .pipe(gulp.dest('./' + projectBase + '/css/'))
        .pipe(browserSync.reload({stream: true}));
});

gulp.task('watch', () => {
    return gulp.watch(['less/**/*.less', 'css/**/*.css', 'js/**/*.js'], {cwd: projectBase}, () => {
        gulp.run('less');
        reload();
    });
});

gulp.task('watch-less', () => {
    return gulp.watch(['less/**/*.less'], {cwd: projectBase}, () => {
        gulp.run('less');
    });
});


//SASS

//带sourcemap的sass开发用编译
gulp.task('sass-dev', () => {
    return gulp.src(projectBase + '/scss/**/*.scss')
        .pipe(sourcemaps.init())
        .pipe(sass().on('error', sass.logError))
        .pipe(sourcemaps.write())
        .pipe(prefix('last 2 versions'))
        .pipe(gulp.dest(projectBase + '/css/'));
});

//无sourcemap的sass上线用编译
gulp.task('sass-prod', () => {

    return gulp.src(projectBase + '/scss/**/*.scss')
        .pipe(sass().on('error', sass.logError))
        .pipe(prefix('last 2 versions'))
        .pipe(gulp.dest(projectBase + '/css/'));
});

//压缩sass生成的css文件
gulp.task('sass-min', ()=> {
    return gulp.src(projectBase + '/scss/**/*.scss')
        .pipe(sass().on('error', sass.logError))
        .pipe(prefix('last 2 versions'))
        .pipe(cssmin())
        .pipe(rename({
            suffix: '.min'
        }))
        .pipe(gulp.dest(projectBase + '/css/'));
});


//压缩js  @todo:refactor with filter module
gulp.task('compressjs', () => {
    var config = {
        mangle: {except: ['$', 'define', 'require', 'exports']},
        compress: false
    };
    return gulp.src([projPath + '/**/*.{js}'])
        .on('end', () => {
            console.log('读取JS文件路径 \n' + projectBase);
        })
        .pipe(uglify(config))

        .pipe(rename({
            extname: '_min.js'
        }))
        .pipe(gulp.dest(projectBase + '/js'))
        .on('end', () => {
            console.log('JS压缩完成，输出到 \n' + projectBase + '/js');
        });
});


//上线后debug   @todo:refactor with filter module
gulp.task('watch-debug', () => {
    gulp.series('sass-dev', 'compressjs')
    gulp.watch(['scss/**/*.scss', 'scss/**/*.sass', 'js/**/*.js'], {cwd: projectBase}, () => {
        gulp.run('compressjs');
        gulp.run('sass-dev');
    });
});

//上线后debug
gulp.task('watch-debug-min', () => {
    gulp.run('sass-min');
    gulp.run('compressjs');
    gulp.watch(['scss/**/*.scss', 'scss/**/*.sass', 'js/**/*.js'], {cwd: projectBase}, () => {
        gulp.run('compressjs');
        gulp.run('sass-min');
    });
});

//sass开发用watch,默认端口3000
gulp.task('watch-all', () => {
    gulp.series('sass-dev', browserSync({
            server: {
                baseDir: projectBase
            }
        }),
        gulp.watch(['scss/**/*.scss', 'scss/**/*.sass', '*.html', 'html/**/*.html'], {cwd: projectBase}, () => {
            gulp.run('sass-dev');
            reload();
        }));

});

gulp.task('clean', () => {
    return del([paths.dist]);
});

gulp.task('build', gulp.series('clean', 'sass-prod', () => {
    //revAll是一个构造方法
    var revAll = new RevAll({
        //html,.min.js,.min.css不加md5
        dontRenameFile: ['.html', '.min.js', '.min.css'],
        dontUpdateReference: ['.html'],

        //rev - revisioned reference path  调整后的路径
        //source - original reference path  源路径(相对于html的路径)
        //path - path to the file         文件路径(绝对路径)

        transformPath(rev, source, file) {

            //如果是cdn绝对地址，不做转换
            if (file.path.indexOf('//') == 0) return;

            //如果不是发布到dist目录,静态资源+cdn前缀
            if (args.domain !== false) {
                var filePath = file.path.slice(__dirname.lastIndexOf('/'))
                return cdn + filePath;
            }
            //如果发布到dist目录，返回转化后地址
            return rev;
        }
    });

    //css，html,js筛选
    var cssFilter = Filter(['**/*.css'], {restore: true});
    var htmlFilter = Filter('**/*.html', {restore: true});
    var jsFilter = Filter(['**/*.js'], {restore: true});

    return gulp.src([projPath + '/**/*.{png,jpg,html,css,js}'])
        .pipe(debug())
        .pipe(revAll.revision())
        .pipe(cssFilter)
        .pipe(debug())
        .pipe(cssmin())
        .pipe(cssFilter.restore)
        .pipe(gulp.dest(paths.dist))
        .pipe(jsFilter)
        .pipe(debug())
        .pipe(uglify())
        .pipe(jsFilter.restore)
        .pipe(gulp.dest(paths.dist))
        .pipe(htmlFilter)
        //conditionals:true，不移除ie浏览器相关的注释代码
        .pipe(gulp.dest(paths.dist))
        //生成manifest文件
        .pipe(revAll.manifestFile())
        .pipe(gulp.dest(paths.dist))
        .pipe(debug());
}));

gulp.task('deploy:cdn', gulp.series((cb)=> {

    if (isProduction) {
        "use strict";

        var upyun = new UPYUN(upyun_config.bucket, upyun_config.operator, upyun_config.password, 'v0');


        var files = glob.sync(paths.dist + '/**/*.{css,jpg,png,gif,js}');

        var i = 0;
        console.log("paths.dir " + paths.dir);
        console.log("paths.dist " + paths.dist);
        files.forEach((file)=> {


            var uploadFile = file.replace(/.:\/(.+\/)*/, ''),
                fileResolvePath = file.replace(glob.sync(paths.dist), '').replace(uploadFile, '').replace(/\/$/,'');
            var remotePath =  '/' + projectName+fileResolvePath;
            console.log("remotePath " + remotePath);
            console.log('resolve path  ' + fileResolvePath);
            console.log('uploadFile  ' + uploadFile);

              upyun.uploadFile(remotePath,file, mime.lookup(file), true, (err, result) => {
             if (err) console.log(err);

             if (result.statusCode != 200) {
             console.log('好像出问题了')
             console.log(result);
             }

             i++;
             if (i === files.length) {

             console.log(i + '个资源文件被上传到又拍云CDN');


             cb();
             }
             });
        });


    } else {
        var hostname = config.test_server.ip;
        return gulp.src(paths.dist + '/**/*.{css,js,jpg,png,gif}')/*@todo:test upload*/
            .pipe(debug());
    }
}));

gulp.task('sass-publish', gulp.parallel('sass-prod', 'sass-min'));

gulp.task('default', gulp.series('sass-dev', 'watch', 'browser-sync'));
 