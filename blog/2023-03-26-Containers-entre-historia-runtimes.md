---
slug: containers-history
title: Containers - entre historia y runtimes
authors: [danielrivera]
tags: [kubernetes]
---

![containers-crazy](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/sox1n5tbcssth6p8eayl.png)

Estudiando kubernetes gasté un tiempo considerable intentando entender muchos conceptos, por ejemplo, por todo lado se habla de _OCI compliant_, buscas _OCI_ y te lleva a _runtime-spec_, buscas _runtimes_ y te lleva a _containerd_, _runc_, _image-spec_, _cgroups_, _namespaces_, etc; puedes pasar días buscando, y mucho más cuando eres del tipo de persona que quiere entender a fondo cómo funcionan las cosas.

<!-- truncate -->

Motivado por lo anterior, me decidí a escribir este post con la idea de compartir los conceptos que logré adquirir y que me han servido para entender varias cosas del gran mundo de los containers, en algunas cosas no voy a tan bajo nivel ya que hay muchos conceptos que todavía desconozco y puedo decir cosas equiviocadas.

## Lo básico

Iniciemos entendiendo un poco la idea detrás de los containers.

Containers tienen como objetivo crear un ambiente virtual **_aislado_** el cual se pueda distribuir y desplegar fácilmente. Dentro del container pueden correr diferentes procesos los cuales deben estar aislados de otros corriendo en el host. El kernel de linux ofrece distintas funcionalidades que permiten la creación de estos ambientes. Hay dos componentes principales que quizás son el core de todos los containers.

### Linux namespaces

Linux namespaces nos permite crear ambientes virtuales y aislados, estos particionan recursos del kernel y hacen que  sean visibles solo para los procesos que corren dentro del namespace, pero no para procesos externos. En otras palabras, namespaces nos facilitan el aislamiento entre procesos.

¿Qué recursos se pueden particionar?, bueno esto va a depender del [tipo de namespace](https://www.redhat.com/sysadmin/7-linux-namespaces) que se este usando, por ejemplo, network namespaces nos permite encapsular los recursos relacionados con networking, como interfaces, tablas de rutas, etc. De esta forma podemos crear una red virtual dentro de nuestro namespace.

Este [post](https://www.redhat.com/sysadmin/7-linux-namespaces) explica un poco más en detalle los namespaces.

### cgroups

Recordemos que el Kernel de Linux es la interfaz principal entre el hardware y los procesos, permitiendo la comunicación entre estos dos y ayudando a la gestión de recursos, por ejemplo, puede terminar procesos que consuman demasiada memoria para evitar afectar el sistema operativo. Adicionalmente pueden controlar qué procesos pueden consumir cierta cantidad de recursos.

cgroups es una funcionalidad del Kernel de Linux que permite organizar jerárquicamente procesos y distribuir recursos(cpu, memoria, networking, storage) dentro de dicha jerarquía.

Configurar cgroups puede ser un poco complejo, en mi caso estuve leyendo varios post acerca del tema y requiere cierto tiempo para entender por completo su funcionamiento. En esta [serie de posts](https://www.redhat.com/sysadmin/cgroups-part-one) creados por RedHat se habla sobe cgroups y su configuración a través de systemd, pero si se desea entrar en detalle la [documentación de Linux](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v1/cgroups.html) puede ser de ayuda.

cgroups y namespaces se convierten en los ingredientes secretos en la creación de containers, namespaces permiten aislamiento a nivel de recursos y cgroups permiten controlar los limites para dichos recursos.

Por suerte hoy en día con una sola linea podemos crear un container, no tenemos que entrar a configurar namespaces ni cgroups.

Veamos un poco de la evolución de los containers y así vamos aclarando ciertas cosas.

### Un poco de historia

Docker fue el primero que popularizó los containers, era(o es) común asociar containers directamente con Docker, pero antes ya existía algo llamado LXC(Linux containers), el cual puede entenderse como un proveedor de ambientes virtuales en Linux que usa ciertos componentes del Kernel de Linux para crear ambientes aislados(containers).

![Image lxc](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/jquo7g5j5iusxgy42wv3.png)

LXC se encuentra dentro del user-space, es decir, nosotros interactuamos con LXC y este se encarga de interactuar con los componentes del kernel para permitir la creación de containers. Aqui un [video](https://www.youtube.com/watch?v=aIwgPKkVj8s) en donde se puede ver LXC en acción.

> **Nota:** Antes de LXC ya se habían desarrollado otros alternativas para la creación de containers como OpenVZ y Linux Vserver. LXC es mencionado inicialmente ya que es lo más cercano a Docker que es el software con el que muchos iniciamos interactuando con containers.

#### La llegada de Docker

Docker empaquetó LXC en una herramienta que facilitaba más la creación de containers. Al ganar popularidad se crearon mejoras y unos meses después Docker lanzó [libcontainer](https://github.com/opencontainers/runc/tree/main/libcontainer) el cual está escrito en [Golang](https://github.com/opencontainers/runc/tree/main/libcontainer) y básicamente reemplazaba LXC.

![Docker libcontainer](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ydjpgj8o2rmm15btbqet.png)

Docker se enfocó más en la creación de containers optimizados para el despliegue de aplicaciones mejorando la portabilidad. Este [post](https://earthly.dev/blog/lxc-vs-docker/) explica más detalladamente las diferencias entre LXC y Docker.

#### Definiendo un estándar para containers

Como alternativa a Docker, empezaron a surgir otras opciones,CoreOS por su parte lanzó [rkt(2014)](https://www.redhat.com/en/topics/containers/what-is-rkt) proponiendo mejores de seguridad, CoreOS [argumentaba](https://lwn.net/Articles/623875/) que Docker había sido construido como un monolito el cual corría como root en el host, abriendo posibilidades a comprometer todo el host en el caso de un ataque.

rkt usa [appc(open source container)](https://github.com/appc) con el fin de mejorar la operabilidad, appc tiene como propósito crear un estándar general para crear containers buscando ser vendor-independent y OS-independent.

Otras iniciativas empezaron a surgir debido a la alta popularidad de los containers y debido a esto, en 2015 se crea [OCI(Open Container Initiative)](https://opencontainers.org/about/overview/) para definir un estandar para containers([runtimes](https://github.com/opencontainers/runtime-spec/blob/main/spec.md) e [imagenes](https://github.com/opencontainers/image-spec/blob/main/spec.md)).

#### OCI Runtime spec

_Runtime spec_ define la configuración(archivo JSON), ambiente y ciclo de vida de un container. Las configuraciones son definidas en un archivo llamado config.json, el cual contiene la metadata necesaria para la ejecución del container, este archivo es definido de acuerdo a plataforma a usar(windows, linux, solaris, etc).

otro concepto a destacar es el _filesystem bundle_, este es un grupo de archivos con la data y metadata para correr un container. Los principales archivos que deben contener son, el config.json mencionado anteriormente y el [rootfs(linux file system)](https://www.baeldung.com/linux/rootfs), este  _filesystem bundle_ se genera a través del container image.

Todas las especificaciones para el container runtime son descritas [aqui](https://github.com/opencontainers/runtime-spec/blob/main/spec.md).

#### OCI Image spec

Docker en sus inicios ya había definido las especificaciones para la creación de imágenes[Image Manifest 2 Schema Version 2](https://docs.docker.com/registry/spec/manifest-v2-2/), al ser el más popular, OCI partió de este para crear un estándar más general, que no estuviera asociado a un vendor en específico. _Image spec_ define como construir y empaquetar container images, personalmente no he entendido del todo el funcionamiento pero aquí está la url del [repo](https://github.com/opencontainers/image-spec) y un [blog-post](https://blog.quarkslab.com/digging-into-the-oci-image-specification.html) que contienen mayor información.

Haciendo uso del _Image spec_, se puede crear un container image que puede ser ejecutada por cualquier _OCI Runtime_, esto quiere decir que a través del _Image spec_ se puede generar el _filesystem bundle_, el cual es usado por el runtime para la creación y ejecución del container.

> The Runtime Specification outlines how to run a "filesystem bundle" that is unpacked on disk. At a high-level an OCI implementation would download an OCI Image then unpack that image into an OCI Runtime filesystem bundle. At this point the OCI Runtime Bundle would be run by an OCI Runtime.

#### Container runtimes y Kubernetes

En el 2015 se lanza el primer release de kubernetes, el cual usaba Docker como runtime.

Docker decide dividir el monolito creado. libcontainer es donado a OCI y Docker empieza a trabajar en un proyecto llamado runC, este se puede ver como una herramienta que lee OCI specifications e interactúa con libcontainer para la creación de containers. runC es independiente del Docker Engine y es donado a OCI.

runC es una low-level runtime por lo que también se desarrolla _containerd_ el cual es como una interfaz entre el cliente y runC.

![docker-runc-containerd](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/zi3mkr4s6u5bbmj3y9ls.png "fuente: https://images.techhive.com/images/article/2016/04/docker-runc-100656060-large.idge.png")

Hasta el momento solo se ha cubierto parte del origen de los container y el origen de algunas herramientas que seguimos viendo hoy en día como runC y conteinerd. En lo que sigue del post trataré de exponer un poco más a fondo las _container images_ al igual que algunas _containers runtimes_.

### Container Images

Antes de entrar a ver las _containers runtimes_, es importante entender qué es lo que contienen las _containers images_, para ello vamos a usar [Skopeo](https://www.redhat.com/en/topics/containers/what-is-skopeo).

Skopeo permite manipular e inspeccionar _container images_ ya sea para Windows, Linux o MacOs. En este caso vamos a usar Skopeo para obtener "el contenido" de una imagen que se encuentra en DockerHub, esto es muy similar al comando [docker export](https://docs.docker.com/engine/reference/commandline/export/),pero en este caso no vamos a instalar Docker.

#### copiando images con skopeo

Para instalar skopeo se puede usar snap en ubuntu

``` bash
sudo snap install skopeo --edge
```

una vez que finalice la instalación podemos copiar una imagen que se encuentra en DockerHub a nuestro local. En este caso se va a usar la imagen de golang.

``` bash
sudo skopeo --insecure-policy copy docker://golang:latest  oci://home/ubuntu/example-dev-to/golang-image-v2
```

Skopeo copia el contenido de la imagen en el destino especificado, en este caso `oci:/home/ubuntu/example-dev-to/golang-image-v2`. En la imagen se puede ver que se tiene un archivo index.json, oci-layout y un directorio llamado blobs. Esto corresponde a la estructura de archivos definidos por [OCI](https://github.com/opencontainers/image-spec/blob/main/spec.md)

![golang-copy-skopeo](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/f76zraaa4bdgws82wr9f.png)

el _index.json_ se puede entender como un resumen de la imagen, en donde se ve el sistema operativo y la arquitectura, además se especifica la ubicación del _image manifest_.

El _image manifest_ contiene metadata de la imagen al igual que las especificaciones de cada layer creada.

Revisando el index.json vamos a encontrar lo siguiente:

![index.json golang image](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/wxaqowqg0vbmhjvsgvsq.png)

Se puede ver información acerca del sistema operativo y arquitectura soportados por la imagen. El digest(linea 6) nos indica en que archivo se encuentra el manifest.json.

![manifest](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/7tyogxsh5q90vgolsvbu.png)

En el manifest(imagen anterior) se puede ver el digest para el config file y para cada una de las layers que se tienen. El [mediaType](https://github.com/opencontainers/image-spec/blob/main/media-types.md) puede entenderse como el formato de cada archivo, por ejemplo la linea 4 nos dice que el archivo config de formato json se puede identificar con el digest `bdba673e96d6e9707e2a724103e8835dbdd11dc81ad0c76c4453066ed8db29fd`. Este se puede encontrar en la carpeta blobs y va a lucir como la siguiente imagen.

![config.json](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/74dolefjcdzij0qhcf3d.png)

Este archivo ya contiene más información de la imagen, por ejemplo podemos ver el workdir y algunas variables de entorno.

pasemos ahora a las layers, en el manifest podemos identificar los digest para cada layers, si vemos el media type nos indica que es `v1.tar+gzip`, en este caso tenemos que descomprimir el contenido de dicho digest, para ello vamos a usar `tar`

![unpackage-digest](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/fd5iwfpygp71jutt0qcx.png)

Una vez termine el proceso podemos analizar el resultado, en este caso vamos a tener una serie de directorios que representan el rootfs de la imagen, estos archivos van a hacer parte de un layer en específico. Si observamos la siguente imagen podemos ver que tenemos /home, /etc y /bin, etc, los cuales representan el sistema de archivos de linux(rootfs).

![rootfs](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/clm54sgl7p2i08gtrd1b.png)

Con esto vemos a alto nivel el contenido de un _container image_, al final el _container runtime_ es el que se encarga de descomprimir y leer todos estos archivos, el cual va a ser usado para correr el container.

Hasta aquí va la primera parte de este post, en la siguiente veremos un poco m'as los container runtimes.
