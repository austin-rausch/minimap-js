var gulp = require('gulp');
var lasso = require('gulp-lasso');
var babel = require('gulp-babel');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var cleanCss = require('gulp-clean-css');

gulp.task('buildTestPage', function () {
  gulp.src('./test/*.html')
  .pipe(
    lasso({
      'configFile': './lasso-config.json',
      'dependencies': [
        './src/minimap.css',
        'require-run: ./test/main.js'
      ]
    })
  )
  .pipe(gulp.dest('test-out'));
});

gulp.task('build', function () {
  // minified js
  gulp.src('src/minimap.js')
  .pipe(
    lasso({
      'configFile': './lasso-config.json'
    })
  )
  .pipe(
    babel({
      presets: ['es2015']
    }))
  .pipe(uglify())
  .pipe(rename('minimap.min.js'))
  .pipe(gulp.dest('dist'));

  // non-minified js
  gulp.src('src/minimap.js')
  .pipe(
    lasso({
      'configFile': './lasso-config.json'
    })
  )
  .pipe(
    babel({
      presets: ['es2015']
    })
  )
  .pipe(gulp.dest('dist'));

  // minified css
  gulp.src('src/minimap.css')
  .pipe(cleanCss())
  .pipe(rename('minimap.min.css'))
  .pipe(gulp.dest('dist'));

  // non-minified css
  gulp.src('src/minimap.css')
  .pipe(gulp.dest('dist'));
});
