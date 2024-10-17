import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'AWS Content',
    imgSrc: require('@site/static/img/aws-logo.png').default,
    //Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        AWS Related content
      </>
    ),
  },
  {
    title: 'Kubernetes and container content',
    imgSrc: require('@site/static/img/Kubernetes-logo.png').default,
    //Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Kubernetes and container content
      </>
    ),
  },

];

function Feature({ imgSrc,title, description}) {
  return (
    <div className={clsx('col col--4')}>
      {imgSrc && (
        <div className="text--center">
          <img src={imgSrc} alt={title} className={styles.featureImg} />
        </div>
      )}
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
